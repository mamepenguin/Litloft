import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

import app.config as config
from app.database import get_db
from app.models import Tag, Video, video_tags
from app.schemas import (
    TagUpdate,
    VideoResponse,
    VideoUpdate,
    video_to_response,
)

router = APIRouter(prefix="/api/videos", tags=["videos"])

PLACEHOLDER_THUMBNAIL = Path(__file__).parent.parent / "static" / "placeholder.jpg"


def _validate_path(file_path: str, base_dir: Path) -> Path:
    real_path = Path(os.path.realpath(file_path))
    real_base = Path(os.path.realpath(base_dir))
    if not str(real_path).startswith(str(real_base)):
        raise HTTPException(status_code=403, detail="Access denied")
    return real_path


_to_response = video_to_response


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


@router.post("/{video_id}/like", response_model=VideoResponse)
async def like_video(
    video_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video.likes = Video.likes + 1
    db.commit()
    db.refresh(video)
    return _to_response(video)


@router.post("/{video_id}/dislike", response_model=VideoResponse)
async def dislike_video(
    video_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video.dislikes = Video.dislikes + 1
    db.commit()
    db.refresh(video)
    return _to_response(video)


@router.post("/{video_id}/favorite", response_model=VideoResponse)
async def toggle_favorite(
    video_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video.is_favorite = not video.is_favorite
    db.commit()
    db.refresh(video)
    return _to_response(video)


@router.put("/{video_id}/tags", response_model=VideoResponse)
async def update_video_tags(
    video_id: int,
    update: TagUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    tag_objects = []
    for tag_name in update.tags:
        tag = db.query(Tag).filter(Tag.name == tag_name, Tag.drive == video.drive).first()
        if not tag:
            tag = Tag(name=tag_name, drive=video.drive)
            db.add(tag)
            db.flush()
        tag_objects.append(tag)

    video.tags = tag_objects
    db.commit()

    orphans = (
        db.query(Tag)
        .outerjoin(video_tags)
        .filter(video_tags.c.video_id.is_(None))
        .all()
    )
    for orphan in orphans:
        db.delete(orphan)
    if orphans:
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

    drive_path = config.get_drive_path(video.drive)
    file_path = _validate_path(
        str(drive_path / video.file_path), drive_path
    )
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

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
