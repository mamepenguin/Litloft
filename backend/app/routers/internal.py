import hmac
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, StringConstraints, field_validator
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

import app.config as config
from app.services.markdown_relations import INTERNAL_ORIGIN
from app.auth import filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import (
    TRUST_TIERS,
    File,
    FileRelation,
    WatchHistory,
    active_file_filter,
)
from app.routers.files import replace_file_tags
from app.services.tagops import cleanup_orphan_tags
from app.schemas import (
    ChapterPromotionRequest,
    TagUpdate,
    TrustTierUpdate,
    file_to_response,
)
from app.services.chapters import replace_chapters
from app.services.ws import manager as ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])

# Mirrors the ``PUT /api/files/{id}/content`` allowlist so read and write
# agree on what "text" means.
_CONTENT_READ_ALLOWED_MIMES = frozenset({"text/markdown", "text/plain"})
_CONTENT_READ_MAX_BYTES = int(
    os.environ.get("CORE_INTERNAL_CONTENT_MAX_BYTES", 10 * 1024 * 1024)
)


def verify_internal_secret(
    x_internal_secret: str = Header(default=""),
) -> None:
    """Gate internal endpoints behind the shared-secret header.

    When ``CORE_INTERNAL_SECRET`` is unset the gate is a no-op, matching
    the ``KNOWLEDGE_WEBHOOK_SECRET`` pattern for dev parity. Production
    deployments must set the same secret on both the core and the addon
    service so the Docker-network boundary is not the sole defence.

    Constant-time comparison avoids leaking token length/prefix via
    timing — cheap insurance even though the Docker network is trusted.
    """
    expected = os.environ.get("CORE_INTERNAL_SECRET", "")
    if not expected:
        return
    if not hmac.compare_digest(x_internal_secret, expected):
        raise HTTPException(status_code=403, detail="Invalid internal secret")


def verify_internal_write_secret(
    x_internal_secret: str = Header(default=""),
) -> None:
    """Strictly gate integrity-changing addon-to-core writes.

    Unlike the legacy optional gate used by content reads and older internal
    endpoints, an unset secret fails closed. This verifier is deliberately
    specific to strict write endpoints so tightening this boundary does not
    silently change the existing development contract elsewhere.
    """
    expected = os.environ.get("CORE_INTERNAL_SECRET", "")
    if not expected.strip():
        raise HTTPException(
            status_code=503,
            detail="Internal write secret is not configured",
        )
    if not hmac.compare_digest(x_internal_secret, expected):
        raise HTTPException(status_code=403, detail="Invalid internal secret")


@router.get("/drive-policy")
def drive_policy(drive: str, addon: str):
    """Return per-drive addon policy in a stable two-key shape.
    Returns 404 when the drive does not exist so addons cannot probe
    unknown drives.
    """
    try:
        policy = config.get_drive_addon_policy(drive, addon)
    except ValueError:
        raise HTTPException(status_code=404, detail="Drive not found")

    if "_all" in policy:
        return {"default": bool(policy["_all"]), "features": {}}
    return {
        "default": True,
        "features": {k: bool(v) for k, v in policy.items()},
    }


@router.get("/accessible-drives")
def accessible_drives(
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    """Return list of drive names accessible with the current token."""
    drives = filter_drives(config.load_drives(), unlocked_groups)
    return {"drives": [d["name"] for d in drives]}


@router.get("/files/{file_id}")
def file_info(
    file_id: str,
    db=Depends(get_db),
):
    """Return basic file metadata. No access control (internal use only)."""
    file = (
        db.query(File)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "id": file.id,
        "drive": file.drive,
        "filename": file.filename,
        "file_type": file.file_type,
        "folder_path": file.folder_path,
        "thumbnail_path": file.thumbnail_path,
        "updated_at": file.updated_at.isoformat() if file.updated_at else None,
    }


@router.post(
    "/files/{file_id}/tags",
    dependencies=[Depends(verify_internal_secret)],
    status_code=204,
)
def replace_file_tags_internal(
    file_id: str,
    update: TagUpdate,
    db=Depends(get_db),
) -> Response:
    """Replace a file's tags via trusted internal caller.

    No viewer cookie is required, so the shared ``CORE_INTERNAL_SECRET`` is
    the sole defence beyond the Docker network boundary.
    """
    file = (
        db.query(File)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    replace_file_tags(db, file, update.tags)
    cleanup_orphan_tags(db, file.drive)
    db.commit()
    return Response(status_code=204)


@router.put(
    "/files/{file_id}/chapters",
    dependencies=[Depends(verify_internal_write_secret)],
    status_code=204,
)
def promote_file_chapters_internal(
    file_id: str,
    update: ChapterPromotionRequest,
    db=Depends(get_db),
) -> Response:
    """Promote an addon's approved chapter candidates into core.

    The caller supplies values only. Core applies the same normalisation as
    every other producer, assigns dense ordering, and forces curated
    provenance. A request with no usable chapters fails schema validation, so
    ``replace_chapters`` can never interpret an empty approval as deletion.
    """
    file = (
        db.query(File)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    replace_chapters(
        db,
        file.id,
        update.normalised_chapters(),
        "curated",
    )
    db.commit()
    return Response(status_code=204)


def _resolve_text_content_path(file: File) -> Path:
    """Resolve ``file`` to an absolute path inside its drive.

    Kept local to avoid a cross-router import that would pull ``files.py``'s
    FastAPI surface into this module.
    """
    drive_path = config.get_drive_path(file.drive)
    real_path = Path(os.path.realpath(str(drive_path / file.file_path)))
    real_base = Path(os.path.realpath(drive_path))
    base_str = str(real_base)
    if not (
        str(real_path) == base_str
        or str(real_path).startswith(base_str + os.sep)
    ):
        raise HTTPException(status_code=403, detail="Path escape detected")
    return real_path


@router.get(
    "/files/{file_id}/content",
    dependencies=[Depends(verify_internal_secret)],
    response_class=PlainTextResponse,
)
def file_text_content(
    file_id: str,
    db=Depends(get_db),
) -> PlainTextResponse:
    """Return the raw UTF-8 text content of a file.

    Docker-internal only. Unlike ``/api/files/{id}/stream`` this endpoint
    is not subject to ``lit_token`` drive-unlock checks, which is the
    whole point: the knowledge addon's frontmatter scanner runs without
    any user context and must be able to read ``.md`` files on protected
    drives to keep the ``note_origins`` cache in sync.
    """
    file = (
        db.query(File)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    mime = file.mime_type or ""
    if mime not in _CONTENT_READ_ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail=f"Mime type not readable via this endpoint: {mime}",
        )

    file_path = _resolve_text_content_path(file)
    try:
        size = file_path.stat().st_size
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found on disk")

    if size > _CONTENT_READ_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds internal read limit of {_CONTENT_READ_MAX_BYTES} bytes",
        )

    try:
        text = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=415,
            detail="File is not valid UTF-8 text",
        )

    return PlainTextResponse(text, media_type="text/plain; charset=utf-8")


# viewer_id is a 16-char SHA-256 prefix produced by ``nickname_to_viewer_id``
# (see ``app.auth``). Validated server-side so a malformed query parameter
# never reaches the WatchHistory.viewer_id filter as wildcard input.
_VIEWER_ID_PATTERN = re.compile(r"^[a-f0-9]{16}$")


def _parse_iso8601_or_400(value: str | None, field_name: str) -> datetime | None:
    """Parse an ISO-8601 datetime string or raise 400.

    The returned datetime is *naive* (no ``tzinfo``). ``WatchHistory.last_played_at``
    is stored without a timezone and SQLite compares naive datetimes as
    text — feeding an aware datetime into the same filter would compare
    against the row's text form (``YYYY-MM-DD HH:MM:SS``) using a string
    that carries an ``+00:00`` offset and silently mis-rank the boundary.
    Aware inputs (``...Z`` / ``...+09:00``) are converted to UTC and the
    offset stripped so the comparison stays apples-to-apples regardless
    of which form the caller chose.
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} (expected ISO-8601): {exc}",
        ) from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


@router.get(
    "/viewer-history",
    dependencies=[Depends(verify_internal_secret)],
)
def viewer_history(
    viewer_id: Annotated[str, Query(...)],
    drive: Annotated[str, Query(...)],
    after: Annotated[str | None, Query()] = None,
    before: Annotated[str | None, Query()] = None,
    kind: Annotated[str, Query()] = "viewed",
    db=Depends(get_db),
):
    """Return file_ids the viewer has touched in this drive within a window.

    The addon proxy is responsible for ensuring the upstream caller has
    already passed drive-unlock checks before hitting this endpoint.

    Returns ``{"file_ids": [...]}`` with no guaranteed ordering.
    """
    if not _VIEWER_ID_PATTERN.fullmatch(viewer_id):
        raise HTTPException(status_code=400, detail="Invalid viewer_id")

    if kind not in {"viewed", "not_viewed"}:
        raise HTTPException(
            status_code=400, detail="kind must be 'viewed' or 'not_viewed'"
        )

    drive_names = {d["name"] for d in config.load_drives()}
    if drive not in drive_names:
        # 404, not 403 — mirrors the existence-hiding pattern used by
        # ``/drive-policy`` so an attacker cannot enumerate drive names
        # via this endpoint either.
        raise HTTPException(status_code=404, detail="Drive not found")

    after_dt = _parse_iso8601_or_400(after, "after")
    before_dt = _parse_iso8601_or_400(before, "before")

    if after_dt and before_dt and after_dt >= before_dt:
        # Without this the not_viewed branch below silently degenerates into
        # "every active file in the drive".
        raise HTTPException(
            status_code=400, detail="'after' must be earlier than 'before'"
        )

    viewed_q = (
        db.query(WatchHistory.file_id)
        .join(File, WatchHistory.file_id == File.id)
        .filter(
            WatchHistory.viewer_id == viewer_id,
            File.drive == drive,
            active_file_filter(),
        )
    )
    if after_dt is not None:
        viewed_q = viewed_q.filter(WatchHistory.last_played_at >= after_dt)
    if before_dt is not None:
        viewed_q = viewed_q.filter(WatchHistory.last_played_at < before_dt)

    if kind == "viewed":
        return {"file_ids": [row.file_id for row in viewed_q.all()]}

    # SQL anti-join is preferred over Python set difference because a
    # well-populated drive can hold tens of thousands of rows; a single
    # NOT IN scan inside SQLite is cheaper than ferrying that many IDs
    # over the DB-API boundary just to subtract the small viewed slice.
    excluded = (
        db.query(WatchHistory.file_id)
        .filter(WatchHistory.viewer_id == viewer_id)
    )
    if after_dt is not None:
        excluded = excluded.filter(WatchHistory.last_played_at >= after_dt)
    if before_dt is not None:
        excluded = excluded.filter(WatchHistory.last_played_at < before_dt)

    not_viewed_q = (
        db.query(File.id)
        .filter(
            File.drive == drive,
            active_file_filter(),
            File.id.notin_(excluded),
        )
    )
    return {"file_ids": [row.id for row in not_viewed_q.all()]}


class FilterFileIdsRequest(BaseModel):
    file_ids: list[str]
    trust_tier: str | None = None

    @field_validator("trust_tier")
    @classmethod
    def validate_trust_tier(cls, v: str | None) -> str | None:
        if v is not None and v not in TRUST_TIERS:
            raise ValueError(f"trust_tier must be one of {', '.join(TRUST_TIERS)}")
        return v


@router.put(
    "/files/{file_id}/trust-tier",
    dependencies=[Depends(verify_internal_write_secret)],
    status_code=204,
)
def set_file_trust_tier_internal(
    file_id: str,
    update: TrustTierUpdate,
    db=Depends(get_db),
) -> Response:
    """Let an addon declare a file's trust tier as it ingests it.

    This is a declaration, not a judgement, so ``trust_reviewed_at`` is
    deliberately left untouched: an addon has reviewed nothing. Only a
    person acting through the core UI stamps that column.
    """
    # Conditional update rather than read-then-write: a viewer promoting the
    # file concurrently must win, and the check has to be atomic to mean
    # anything. Writing the tier while a person's ``trust_reviewed_at``
    # stands would attribute the addon's declaration to them.
    updated = (
        db.query(File)
        .filter(
            File.id == file_id,
            active_file_filter(),
            File.trust_reviewed_at.is_(None),
        )
        .update({File.trust_tier: update.tier}, synchronize_session=False)
    )
    if updated:
        db.commit()
        return Response(status_code=204)

    db.rollback()
    exists = (
        db.query(File.id)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")
    raise HTTPException(
        status_code=409,
        detail="Trust tier already decided by a viewer",
    )


@router.post("/filter-file-ids")
def filter_file_ids(
    body: FilterFileIdsRequest,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
    db=Depends(get_db),
):
    """Filter file IDs by access control, and optionally by trust tier.

    The response echoes ``trust_filtered`` so a caller can tell "core applied
    my filter" apart from "core is too old to know about it and ignored the
    field". Addons are versioned independently of core, and an unknown field
    is silently dropped rather than rejected, so without this marker a
    grounding caller would read an unfiltered list as verified.
    """
    if not body.file_ids:
        return {"accessible": [], "trust_filtered": body.trust_tier is not None}

    accessible_drive_names = {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }

    conditions = [File.id.in_(body.file_ids), active_file_filter()]
    if body.trust_tier is not None:
        conditions.append(File.trust_tier == body.trust_tier)

    files = db.query(File.id, File.drive).filter(*conditions).all()

    accessible = [
        f.id for f in files if f.drive in accessible_drive_names
    ]
    return {
        "accessible": accessible,
        "trust_filtered": body.trust_tier is not None,
    }


class BulkStateRequest(BaseModel):
    file_ids: list[str]


@router.post("/files/bulk-state")
def files_bulk_state(
    body: BulkStateRequest,
    db=Depends(get_db),
):
    """Return the lifecycle state of each file ID in bulk."""
    if not body.file_ids:
        return {"statuses": [], "not_found": []}

    rows = (
        db.query(File.id, File.drive, File.deleted_at, File.missing_since)
        .filter(File.id.in_(body.file_ids))
        .all()
    )

    by_id = {row.id: row for row in rows}
    statuses: list[dict] = []
    for fid in body.file_ids:
        row = by_id.get(fid)
        if row is None:
            continue
        if row.deleted_at is not None:
            state = "trash"
        elif row.missing_since is not None:
            state = "missing"
        else:
            state = "active"
        statuses.append({"id": row.id, "drive": row.drive, "state": state})

    not_found = [fid for fid in body.file_ids if fid not in by_id]
    return {"statuses": statuses, "not_found": not_found}


class BulkFilesRequest(BaseModel):
    file_ids: list[str]


@router.post("/files/bulk")
def files_bulk(
    body: BulkFilesRequest,
    db=Depends(get_db),
):
    """Return full file metadata in bulk for a list of IDs.

    Rows in trash or missing are returned in ``not_found``: the caller's UI
    represents semantic results as live-active files.

    ``subtitles`` is returned as ``[]`` to avoid per-file ffprobe. Callers that
    need subtitles should fall through to ``GET /api/internal/files/{id}``.
    """
    if not body.file_ids:
        return {"files": [], "not_found": []}

    rows = (
        db.query(File)
        .filter(File.id.in_(body.file_ids), active_file_filter())
        .all()
    )
    by_id = {row.id: row for row in rows}

    files = [
        file_to_response(by_id[fid])
        for fid in body.file_ids
        if fid in by_id
    ]
    not_found = [fid for fid in body.file_ids if fid not in by_id]

    return {"files": files, "not_found": not_found}


class FileRelationCreate(BaseModel):
    file_id_a: str
    file_id_b: str
    kind: Annotated[
        str, StringConstraints(min_length=1, max_length=32, pattern=r"^[a-z][a-z0-9_.-]*$")
    ]
    viewer_id: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{16}$")] | None = None


def _relation_to_dict(rel: FileRelation) -> dict:
    return {
        "id": rel.id,
        "file_id_a": rel.file_id_a,
        "file_id_b": rel.file_id_b,
        "kind": rel.kind,
        "created_at": rel.created_at.isoformat() if rel.created_at else None,
        "created_by": rel.created_by,
    }


@router.post(
    "/file_relations",
    status_code=201,
    dependencies=[Depends(verify_internal_secret)],
)
def create_file_relation(
    body: FileRelationCreate,
    db=Depends(get_db),
):
    """Create a relation between two files in the same drive."""
    if body.file_id_a == body.file_id_b:
        raise HTTPException(status_code=400, detail="files must differ")

    files = (
        db.query(File)
        .filter(File.id.in_([body.file_id_a, body.file_id_b]))
        .all()
    )
    by_id = {f.id: f for f in files}
    if body.file_id_a not in by_id or body.file_id_b not in by_id:
        raise HTTPException(status_code=404, detail="file not found")

    if by_id[body.file_id_a].drive != by_id[body.file_id_b].drive:
        raise HTTPException(
            status_code=400, detail="files must be in the same drive"
        )

    rel = FileRelation(
        file_id_a=body.file_id_a,
        file_id_b=body.file_id_b,
        kind=body.kind,
        created_by=body.viewer_id,
        origin=INTERNAL_ORIGIN,
    )
    db.add(rel)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="relation already exists")
    db.refresh(rel)
    return _relation_to_dict(rel)


_DRIVE_LIST_DEFAULT_LIMIT = 5000


@router.get("/file_relations")
def list_file_relations(
    file_id: str | None = Query(None),
    drive: str | None = Query(None),
    kind: str | None = Query(None),
    limit: int = Query(_DRIVE_LIST_DEFAULT_LIMIT, ge=1, le=20000),
    db=Depends(get_db),
):
    """List file_relations rows."""
    if file_id is None and drive is None:
        raise HTTPException(
            status_code=400,
            detail="either file_id or drive is required",
        )

    q = db.query(FileRelation)
    if file_id is not None:
        q = q.filter(
            or_(
                FileRelation.file_id_a == file_id,
                FileRelation.file_id_b == file_id,
            )
        )
    if drive is not None:
        # Anchor on file_id_a's drive — same-drive invariant is enforced
        # by POST /file_relations so file_id_b is guaranteed to match.
        q = q.join(File, File.id == FileRelation.file_id_a).filter(
            File.drive == drive
        )
    if kind is not None:
        q = q.filter(FileRelation.kind == kind)

    q = q.limit(limit)
    return [_relation_to_dict(r) for r in q.all()]


@router.delete(
    "/file_relations/{relation_id}",
    status_code=204,
    dependencies=[Depends(verify_internal_secret)],
)
def delete_file_relation(
    relation_id: int,
    db=Depends(get_db),
):
    rel = (
        db.query(FileRelation).filter(FileRelation.id == relation_id).first()
    )
    if not rel:
        raise HTTPException(status_code=404, detail="relation not found")
    db.delete(rel)
    db.commit()
    return Response(status_code=204)


class AddonEventRequest(BaseModel):
    event: Annotated[
        str, StringConstraints(min_length=1, max_length=128, pattern=r"^[a-z][a-z0-9_.]*$")
    ]
    data: dict
    drive: str | None = None


class RestartPendingRequest(BaseModel):
    """Notice from an addon that user-visible config has changed."""

    source: Annotated[
        str,
        StringConstraints(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_.-]*$"),
    ]
    reason: str | None = None


@router.post(
    "/restart-pending",
    status_code=204,
    dependencies=[Depends(verify_internal_secret)],
)
def set_restart_pending(body: RestartPendingRequest) -> Response:
    """Touch ``data/restart_pending`` on behalf of an addon."""
    flag = config.DATA_DIR / "restart_pending"
    try:
        flag.parent.mkdir(parents=True, exist_ok=True)
        flag.touch()
        logger.info(
            "restart_pending touched by addon %s: %s",
            body.source, body.reason or "(no reason given)",
        )
    except OSError as exc:
        logger.exception("Failed to touch restart_pending flag: %s", exc)
        raise HTTPException(
            status_code=500, detail="Cannot write restart_pending sentinel"
        ) from exc
    return Response(status_code=204)


@router.post(
    "/addon-events",
    status_code=204,
    dependencies=[Depends(verify_internal_secret)],
)
async def broadcast_addon_event(body: AddonEventRequest):
    """Forward an addon-generated WebSocket event to connected clients.

    External-service addons cannot reach the host's WS broadcaster directly,
    so they POST here and the core process relays the payload.
    """
    try:
        await ws_manager.broadcast(body.event, body.data, drive=body.drive)
    except Exception as exc:  # noqa: BLE001
        logger.warning("broadcast_addon_event %s failed: %s", body.event, exc)
    return Response(status_code=204)
