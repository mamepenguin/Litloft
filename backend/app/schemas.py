import re
from datetime import datetime

from pydantic import BaseModel, field_validator


class VideoResponse(BaseModel):
    id: int
    filename: str
    title: str
    description: str
    category: str
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


class VideoDetail(VideoResponse):
    file_path: str


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


class CategoryResponse(BaseModel):
    name: str
    count: int


class TagResponse(BaseModel):
    name: str
    count: int


class ScanResponse(BaseModel):
    added: int
    removed: int
    total: int
