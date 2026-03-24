import re
from datetime import datetime

from pydantic import BaseModel, field_validator


class VideoResponse(BaseModel):
    id: int
    filename: str
    title: str
    description: str
    drive: str
    folder_path: str
    thumbnail_url: str
    file_size: int
    duration: float | None
    likes: int
    dislikes: int
    is_favorite: bool
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VideoUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class TagUpdate(BaseModel):
    tags: list[str]

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Maximum 10 tags per video")
        normalized = []
        for tag in v:
            tag = tag.strip().lower()
            if not tag:
                continue
            if len(tag) > 30:
                raise ValueError(f"Tag '{tag}' exceeds 30 characters")
            if not re.match(r"^[\w\-]+$", tag, re.UNICODE):
                raise ValueError(f"Tag '{tag}' contains invalid characters")
            normalized.append(tag)
        return list(dict.fromkeys(normalized))


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int


class PaginatedResponse(BaseModel):
    data: list[VideoResponse]
    meta: PaginationMeta


class DriveResponse(BaseModel):
    name: str


class FolderResponse(BaseModel):
    name: str
    path: str
    video_count: int


class TagResponse(BaseModel):
    name: str
    count: int


class ScanResponse(BaseModel):
    added: int
    removed: int
    updated: int = 0
    total: int


def video_to_response(video) -> VideoResponse:
    return VideoResponse(
        id=video.id,
        filename=video.filename,
        title=video.title,
        description=video.description,
        drive=video.drive,
        folder_path=video.folder_path,
        thumbnail_url=f"/api/videos/{video.id}/thumbnail",
        file_size=video.file_size,
        duration=video.duration,
        likes=video.likes,
        dislikes=video.dislikes,
        is_favorite=video.is_favorite,
        tags=[tag.name for tag in video.tags],
        created_at=video.created_at,
        updated_at=video.updated_at,
    )
