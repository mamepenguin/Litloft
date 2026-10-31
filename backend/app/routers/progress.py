import math
from collections import defaultdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Response
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.auth import (
    check_drive_access,
    get_unlocked_groups,
    get_viewer_id,
    nickname_to_viewer_id,
)
from app.database import get_db
from app.models import File, PlayedSegment, WatchHistory, active_file_filter
from app.schemas import (
    PLAYED_SEGMENT_SECONDS,
    PlayedRange,
    PlayedRangesRequest,
    PlayedSegmentItem,
    PlayedSegmentsResponse,
    ProgressResponse,
    ProgressUpdateRequest,
)

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
    db.query(PlayedSegment).filter(
        PlayedSegment.viewer_id == viewer_id, PlayedSegment.file_id == file_id
    ).delete(synchronize_session=False)
    db.commit()

    return Response(status_code=204)


def _segment_seconds(ranges: list[PlayedRange]) -> dict[int, float]:
    totals: dict[int, float] = defaultdict(float)
    for r in ranges:
        first = math.floor(r.start / PLAYED_SEGMENT_SECONDS)
        last = math.ceil(r.end / PLAYED_SEGMENT_SECONDS)
        for index in range(first, last):
            lo = max(r.start, index * PLAYED_SEGMENT_SECONDS)
            hi = min(r.end, (index + 1) * PLAYED_SEGMENT_SECONDS)
            if hi > lo:
                totals[index] += hi - lo
    return totals


@router.post("/{file_id}/played-ranges", status_code=204)
def add_played_ranges(
    file_id: FileId,
    body: PlayedRangesRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    if viewer_id is None:
        return Response(status_code=204)

    _get_file_or_404(db, file_id, unlocked_groups)

    totals = _segment_seconds(body.ranges)
    stmt = sqlite_insert(PlayedSegment)
    stmt = stmt.on_conflict_do_update(
        index_elements=["viewer_id", "file_id", "segment_index"],
        set_={"played_seconds": PlayedSegment.played_seconds + stmt.excluded.played_seconds},
    )
    db.execute(
        stmt,
        [
            {
                "viewer_id": viewer_id,
                "file_id": file_id,
                "segment_index": index,
                "played_seconds": seconds,
            }
            for index, seconds in totals.items()
        ],
    )
    db.commit()
    return Response(status_code=204)


@router.get("/{file_id}/played-segments", response_model=PlayedSegmentsResponse)
def get_played_segments(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    if viewer_id is None:
        return PlayedSegmentsResponse(segments=[])

    rows = (
        db.query(PlayedSegment)
        .filter(PlayedSegment.viewer_id == viewer_id, PlayedSegment.file_id == file_id)
        .order_by(PlayedSegment.segment_index)
        .all()
    )
    return PlayedSegmentsResponse(
        segments=[
            PlayedSegmentItem(index=row.segment_index, played_seconds=row.played_seconds)
            for row in rows
        ]
    )
