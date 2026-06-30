from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Response
from sqlalchemy.orm import Session

from app.auth import (
    check_drive_access,
    get_unlocked_groups,
    get_viewer_id,
    nickname_to_viewer_id,
)
from app.database import get_db
from app.models import File, WatchHistory, active_file_filter
from app.schemas import ProgressResponse, ProgressUpdateRequest

router = APIRouter(prefix="/api/files", tags=["progress"])

FileId = Annotated[str, PathParam(min_length=12, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")]


def _get_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(File.id == file_id, active_file_filter()).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    check_drive_access(file.drive, unlocked_groups)
    return file


@router.post("/{file_id}/progress")
def update_progress(
    file_id: FileId,
    body: ProgressUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    if viewer_id is None:
        return Response(status_code=204)

    _get_file_or_404(db, file_id, unlocked_groups)

    existing = (
        db.query(WatchHistory)
        .filter(WatchHistory.viewer_id == viewer_id, WatchHistory.file_id == file_id)
        .first()
    )

    # Two valid call shapes (enforced by ProgressUpdateRequest):
    #   1. Media playback   — position+duration both set; bumps last_played_at
    #      and updates the playback markers. Issued by VideoPlayer/AudioPlayer.
    #   2. View-only record — both omitted; only last_played_at advances.
    #      Issued by the file detail page on open so text/PDF/image files
    #      surface in personal_history queries (spec
    #      ``2026-04-26-intelligence-ask-personal-history-query.md`` §4.2).
    now = datetime.now(UTC)
    if existing:
        if body.position is not None and body.duration is not None:
            existing.playback_position = body.position
            existing.duration = body.duration
        existing.last_played_at = now
    else:
        record = WatchHistory(
            viewer_id=viewer_id,
            file_id=file_id,
            playback_position=body.position if body.position is not None else 0.0,
            duration=body.duration if body.duration is not None else 0.0,
            last_played_at=now,
        )
        db.add(record)

    db.commit()
    return {"status": "ok"}


@router.get("/{file_id}/progress", response_model=ProgressResponse)
def get_progress(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    if viewer_id is None:
        return ProgressResponse(position=0, duration=0)

    record = (
        db.query(WatchHistory)
        .filter(WatchHistory.viewer_id == viewer_id, WatchHistory.file_id == file_id)
        .first()
    )

    if not record:
        return ProgressResponse(position=0, duration=0)

    return ProgressResponse(position=record.playback_position, duration=record.duration)


@router.delete("/{file_id}/progress", status_code=204)
def delete_progress(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    if viewer_id is None:
        return Response(status_code=204)

    _get_file_or_404(db, file_id, unlocked_groups)

    record = (
        db.query(WatchHistory)
        .filter(WatchHistory.viewer_id == viewer_id, WatchHistory.file_id == file_id)
        .first()
    )

    if record:
        db.delete(record)
        db.commit()

    return Response(status_code=204)
