"""Internal API for external service addons.

These endpoints are intended for Docker-internal network use only.
External service addons (e.g. intelligence) call these to query
core application data such as accessible drives and file metadata.
"""

import hmac
import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, StringConstraints
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

import app.config as config
from app.auth import filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import File, FileActiveSummary, FileRelation, active_file_filter
from app.routers.files import cleanup_orphan_tags, replace_file_tags
from app.schemas import TagUpdate
from app.services.ws import manager as ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])

# Text-content endpoint configuration. Mirrors the ``PUT /api/files/{id}/content``
# allowlist (``backend/app/routers/files.py``) so read and write agree on what
# "text" means. 10 MB is generous for Vault ``.md`` (typically KB-range) and
# leaves headroom for future PDF sidecar text; tweak via env for outlier
# deployments without code change.
_CONTENT_READ_ALLOWED_MIMES = frozenset({"text/markdown", "text/plain"})
_CONTENT_READ_MAX_BYTES = int(
    os.environ.get("CORE_INTERNAL_CONTENT_MAX_BYTES", 10 * 1024 * 1024)
)


async def verify_internal_secret(
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


@router.get("/drive-policy")
async def drive_policy(drive: str, addon: str):
    """Return per-drive addon policy in a stable two-key shape.

    Response::

        {
          "default": bool,           # value used for any feature not in `features`
          "features": { "<name>": bool, ... }
        }

    Examples:
    - drives.json silent → ``{"default": true, "features": {}}``
    - ``"intelligence": false`` → ``{"default": false, "features": {}}``
    - ``"intelligence": {"index": true, "rag": false}`` →
      ``{"default": true, "features": {"index": true, "rag": false}}``

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
async def accessible_drives(
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    """Return list of drive names accessible with the current token."""
    drives = filter_drives(config.load_drives(), unlocked_groups)
    return {"drives": [d["name"] for d in drives]}


@router.get("/files/{file_id}")
async def file_info(
    file_id: str,
    db=Depends(get_db),
):
    """Return basic file metadata. No access control (internal use only).

    ``updated_at`` is the core's last-touched timestamp for the row
    (text content edits, rescan, etc.). Addons use it as a
    mtime-equivalent when reconciling their own cached state — e.g.
    the knowledge frontmatter scanner compares it against the note's
    ``last_synced_at`` to skip untouched rows.
    """
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
        "updated_at": file.updated_at.isoformat() if file.updated_at else None,
    }


@router.post(
    "/files/{file_id}/tags",
    dependencies=[Depends(verify_internal_secret)],
    status_code=204,
)
async def replace_file_tags_internal(
    file_id: str,
    update: TagUpdate,
    db=Depends(get_db),
) -> Response:
    """Replace a file's tags via trusted internal caller.

    Used by the knowledge scanner to project ``frontmatter.tags`` onto
    ``File.tags`` for ``.md`` files (spec
    ``2026-04-24-knowledge-tag-unification.md``). No viewer cookie is
    required — the scanner has no ``hv_token`` — so the shared
    ``CORE_INTERNAL_SECRET`` is the sole defence beyond the Docker
    network boundary, matching the precedent set by
    ``GET /files/{id}/content``.

    Same Tag ensure + orphan cleanup semantics as the public
    ``PUT /api/files/{id}/tags`` (implementation shared via
    ``replace_file_tags`` / ``cleanup_orphan_tags``). Returns 204
    instead of echoing the full ``FileResponse`` because internal
    callers do not need it and skipping the serialisation saves a
    round-trip of tag ORM refreshes.
    """
    file = (
        db.query(File)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    replace_file_tags(db, file, update.tags)
    db.commit()
    cleanup_orphan_tags(db)
    return Response(status_code=204)


def _resolve_text_content_path(file: File) -> Path:
    """Resolve ``file`` to an absolute path inside its drive.

    Reuses the realpath-based containment check from ``files.py`` so a
    compromised ``file_path`` (e.g. symlink escape) cannot be read via
    this endpoint either. Kept local to avoid a cross-router import that
    would pull ``files.py``'s FastAPI surface into this module.
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
async def file_text_content(
    file_id: str,
    db=Depends(get_db),
) -> PlainTextResponse:
    """Return the raw UTF-8 text content of a file.

    Docker-internal only. Unlike ``/api/files/{id}/stream`` this endpoint
    is not subject to ``lit_token`` drive-unlock checks, which is the
    whole point: the knowledge addon's frontmatter scanner runs without
    any user context and must be able to read ``.md`` files on protected
    drives to keep the ``note_origins`` cache in sync.

    Blast radius is limited by three layers:

    1. Shared secret (``CORE_INTERNAL_SECRET``) — optional in dev, set
       symmetrically on core and addon in production. See
       ``verify_internal_secret``.
    2. Mime allowlist — only ``text/markdown`` and ``text/plain``.
       Binaries and media never travel through this endpoint.
    3. Size cap (``CORE_INTERNAL_CONTENT_MAX_BYTES``, default 10 MB) —
       rejects oversized files before we read them off disk.

    Returns 404 for missing / trashed / unknown files so the endpoint
    behaves like ``/api/internal/files/{id}`` for those states.
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


class FilterFileIdsRequest(BaseModel):
    file_ids: list[str]


@router.post("/filter-file-ids")
async def filter_file_ids(
    body: FilterFileIdsRequest,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
    db=Depends(get_db),
):
    """Filter file IDs by access control. Returns only accessible file IDs."""
    if not body.file_ids:
        return {"accessible": []}

    accessible_drive_names = {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }

    files = (
        db.query(File.id, File.drive)
        .filter(
            File.id.in_(body.file_ids),
            active_file_filter(),
        )
        .all()
    )

    accessible = [
        f.id for f in files if f.drive in accessible_drive_names
    ]
    return {"accessible": accessible}


class BulkStateRequest(BaseModel):
    file_ids: list[str]


@router.post("/files/bulk-state")
async def files_bulk_state(
    body: BulkStateRequest,
    db=Depends(get_db),
):
    """Return the lifecycle state of each file ID in bulk.

    Used by addons (e.g. knowledge) that need to reconcile cached
    references to core files after lifecycle webhooks. No access
    control — this is an internal endpoint for service-to-service use.

    Each returned status reports one of three states:

    * ``"active"``   — ``deleted_at IS NULL`` and ``missing_since IS NULL``
    * ``"missing"``  — ``missing_since IS NOT NULL``
    * ``"trash"``    — ``deleted_at IS NOT NULL`` (soft-deleted)

    IDs that no longer exist in the ``files`` table (user-triggered
    physical purge) are reported in ``not_found`` so callers can treat
    them as permanently gone.
    """
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


# ---------------------------------------------------------------------------
# file_relations / file_active_summaries (Step A of knowledge promotion)
# ---------------------------------------------------------------------------


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


def _active_summary_to_dict(row: FileActiveSummary) -> dict:
    return {
        "file_id": row.file_id,
        "summary_file_id": row.summary_file_id,
        "set_at": row.set_at.isoformat() if row.set_at else None,
    }


@router.post("/file_relations", status_code=201)
async def create_file_relation(
    body: FileRelationCreate,
    db=Depends(get_db),
):
    """Create a relation between two files in the same drive.

    Returns 400 when the two file IDs are equal (self-relation),
    400 when the files belong to different drives (spec R4),
    404 when either file does not exist (active files only),
    409 when the (a, b, kind) triple already exists.
    """
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
    )
    db.add(rel)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="relation already exists")
    db.refresh(rel)
    return _relation_to_dict(rel)


@router.get("/file_relations")
async def list_file_relations(
    file_id: str = Query(...),
    kind: str | None = Query(None),
    db=Depends(get_db),
):
    """List relations where file_id appears on either side, optionally filtered by kind."""
    q = db.query(FileRelation).filter(
        or_(
            FileRelation.file_id_a == file_id,
            FileRelation.file_id_b == file_id,
        )
    )
    if kind is not None:
        q = q.filter(FileRelation.kind == kind)
    return [_relation_to_dict(r) for r in q.all()]


@router.delete("/file_relations/{relation_id}", status_code=204)
async def delete_file_relation(
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


class FileActiveSummaryUpsert(BaseModel):
    file_id: str
    summary_file_id: str


@router.post("/file_active_summary")
async def upsert_file_active_summary(
    body: FileActiveSummaryUpsert,
    db=Depends(get_db),
):
    """UPSERT the active summary pointer for file_id → summary_file_id.

    Returns 400 when file_id == summary_file_id,
    400 when the two files live on different drives,
    404 when either file does not exist (active files only).
    """
    if body.file_id == body.summary_file_id:
        raise HTTPException(status_code=400, detail="files must differ")

    files = (
        db.query(File)
        .filter(File.id.in_([body.file_id, body.summary_file_id]))
        .all()
    )
    by_id = {f.id: f for f in files}
    if body.file_id not in by_id or body.summary_file_id not in by_id:
        raise HTTPException(status_code=404, detail="file not found")

    if by_id[body.file_id].drive != by_id[body.summary_file_id].drive:
        raise HTTPException(
            status_code=400, detail="files must be in the same drive"
        )

    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == body.file_id)
        .first()
    )
    if row is None:
        row = FileActiveSummary(
            file_id=body.file_id, summary_file_id=body.summary_file_id
        )
        db.add(row)
    else:
        row.summary_file_id = body.summary_file_id
        # Force onupdate to fire even when summary_file_id is unchanged.
        from datetime import UTC, datetime

        row.set_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)

    # Notify connected clients that this file's summary-view pointer
    # changed. The drive scope scopes access filtering in the WS
    # broadcaster — other drives' viewers never see it. Broadcast
    # failure is swallowed because the persisted row is the source of
    # truth; any reload will pick up the new state.
    try:
        await ws_manager.broadcast(
            "core.file_active_summary.changed",
            {
                "file_id": body.file_id,
                "summary_file_id": body.summary_file_id,
            },
            drive=by_id[body.file_id].drive,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("broadcast file_active_summary.changed failed: %s", exc)

    return _active_summary_to_dict(row)


@router.get("/file_active_summary/{file_id}")
async def get_file_active_summary(
    file_id: str,
    db=Depends(get_db),
):
    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == file_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="active summary not found")
    return _active_summary_to_dict(row)


@router.delete("/file_active_summary/{file_id}", status_code=204)
async def delete_file_active_summary(
    file_id: str,
    db=Depends(get_db),
):
    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == file_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="active summary not found")
    db.delete(row)
    db.commit()

    # Resolve the file's drive for access-filtered broadcast. Looking
    # up post-delete is safe because the FK cascade only fires on the
    # File row (not this row), so the File still exists for an active
    # pointer. If the file was already gone (race against soft-delete),
    # fall back to a broadcast with no drive — every connected client
    # gets it but the payload is harmless (file_id they can't see in
    # any list).
    drive: str | None = None
    file_row = db.query(File.drive).filter(File.id == file_id).first()
    if file_row is not None:
        drive = file_row.drive
    try:
        await ws_manager.broadcast(
            "core.file_active_summary.changed",
            {"file_id": file_id, "summary_file_id": None},
            drive=drive,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("broadcast file_active_summary.changed failed: %s", exc)

    return Response(status_code=204)


class AddonEventRequest(BaseModel):
    event: Annotated[
        str, StringConstraints(min_length=1, max_length=128, pattern=r"^[a-z][a-z0-9_.]*$")
    ]
    data: dict
    drive: str | None = None


@router.post("/addon-events", status_code=204)
async def broadcast_addon_event(body: AddonEventRequest):
    """Forward an addon-generated WebSocket event to connected clients.

    External-service addons (intelligence, knowledge) cannot reach the
    host's WS broadcaster directly, so they POST here and the core
    process relays the payload. When ``drive`` is set, the broadcast is
    access-filtered by the drive's access group so protected-drive
    viewers are the only receivers. Public drives pass through to
    everyone, matching the rest of the broadcaster's behaviour.
    """
    try:
        await ws_manager.broadcast(body.event, body.data, drive=body.drive)
    except Exception as exc:  # noqa: BLE001
        logger.warning("broadcast_addon_event %s failed: %s", body.event, exc)
    return Response(status_code=204)
