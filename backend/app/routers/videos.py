import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

import app.config as config
from app.database import get_db
from app.models import Video
from app.schemas import (
    PaginatedResponse,
    PaginationMeta,
    VideoResponse,
    VideoUpdate,
)

router = APIRouter(prefix="/api/videos", tags=["videos"])

PLACEHOLDER_THUMBNAIL = Path(__file__).parent.parent / "static" / "placeholder.jpg"


def _validate_path(file_path: str, base_dir: Path) -> Path:
    real_path = Path(os.path.realpath(file_path))
    real_base = Path(os.path.realpath(base_dir))
    if not str(real_path).startswith(str(real_base)):
        raise HTTPException(status_code=403, detail="Access denied")
    return real_path


def _to_response(video: Video) -> VideoResponse:
    return VideoResponse(
        id=video.id,
        filename=video.filename,
        title=video.title,
        description=video.description,
        category=video.category,
        thumbnail_url=f"/api/videos/{video.id}/thumbnail",
        file_size=video.file_size,
        duration=video.duration,
        created_at=video.created_at,
        updated_at=video.updated_at,
    )


@router.get("", response_model=PaginatedResponse)
async def list_videos(
    db: Annotated[Session, Depends(get_db)],
    category: str | None = None,
    search: str | None = None,
    sort: str = Query("created_at", pattern="^(created_at|title|file_size)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    query = db.query(Video)

    if category:
        query = query.filter(Video.category == category)
    if search:
        query = query.filter(Video.title.ilike(f"%{search}%"))

    total = query.count()

    sort_column = getattr(Video, sort)
    if order == "desc":
        sort_column = sort_column.desc()
    query = query.order_by(sort_column)

    offset = (page - 1) * limit
    videos = query.offset(offset).limit(limit).all()

    return PaginatedResponse(
        data=[_to_response(v) for v in videos],
        meta=PaginationMeta(total=total, page=page, limit=limit),
    )


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return _to_response(video)


@router.put("/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: int,
    update: VideoUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(video, key, value)

    db.commit()
    db.refresh(video)
    return _to_response(video)


@router.get("/{video_id}/stream")
async def stream_video(
    video_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    file_path = _validate_path(
        str(config.VIDEOS_DIR / video.file_path), config.VIDEOS_DIR
    )
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        range_spec = range_header.replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0])
        end = (
            int(parts[1])
            if parts[1]
            else min(start + config.CHUNK_SIZE - 1, file_size - 1)
        )
        end = min(end, file_size - 1)

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

        return StreamingResponse(
            iter_chunks(),
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(end - start + 1),
                "Content-Type": "video/mp4",
            },
        )

    def iter_full():
        with open(file_path, "rb") as f:
            while chunk := f.read(config.CHUNK_SIZE):
                yield chunk

    return StreamingResponse(
        iter_full(),
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": "video/mp4",
        },
    )


@router.get("/{video_id}/thumbnail")
async def get_thumbnail(
    video_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if video.thumbnail_path:
        thumb_path = _validate_path(
            str(config.THUMBNAILS_DIR / video.thumbnail_path), config.DATA_DIR
        )
        if thumb_path.exists():
            return FileResponse(str(thumb_path), media_type="image/jpeg")

    if PLACEHOLDER_THUMBNAIL.exists():
        return FileResponse(str(PLACEHOLDER_THUMBNAIL), media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Thumbnail not found")
