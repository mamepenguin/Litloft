from datetime import datetime

from pydantic import BaseModel


class VideoResponse(BaseModel):
    id: int
    filename: str
    title: str
    description: str
    category: str
    thumbnail_url: str
    file_size: int
    duration: float | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VideoDetail(VideoResponse):
    file_path: str


class VideoUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


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


class ScanResponse(BaseModel):
    added: int
    removed: int
    total: int
