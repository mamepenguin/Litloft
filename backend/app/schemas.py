import re
from datetime import datetime

from pydantic import BaseModel, field_validator


class FileResponse(BaseModel):
    id: int
    filename: str
    title: str
    description: str
    drive: str
    folder_path: str
    file_type: str
    mime_type: str
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


class FileUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class TagUpdate(BaseModel):
    tags: list[str]

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Maximum 10 tags per file")
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
    data: list[FileResponse]
    meta: PaginationMeta


class DriveResponse(BaseModel):
    name: str


class FolderResponse(BaseModel):
    name: str
    path: str
    file_count: int


class TagResponse(BaseModel):
    name: str
    count: int


class ScanResponse(BaseModel):
    added: int
    removed: int
    updated: int = 0
    total: int


class UploadInitRequest(BaseModel):
    filename: str
    file_size: int
    folder_path: str = ""
    chunk_size: int = 5_242_880


class UploadInitResponse(BaseModel):
    upload_id: str
    chunk_size: int
    total_chunks: int


class ChunkResponse(BaseModel):
    chunk_index: int
    received_chunks: int
    total_chunks: int


class FolderCreateRequest(BaseModel):
    path: str = ""
    name: str


class FolderRenameRequest(BaseModel):
    path: str
    new_name: str


class FileRenameRequest(BaseModel):
    new_filename: str


class FileMoveRequest(BaseModel):
    target_drive: str | None = None
    target_folder_path: str


def _validate_batch_ids(v: list[int]) -> list[int]:
    if not v:
        raise ValueError("At least one file ID is required")
    if len(v) > 100:
        raise ValueError("Maximum 100 files per batch operation")
    return v


class BatchIdsRequest(BaseModel):
    ids: list[int]

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[int]) -> list[int]:
        return _validate_batch_ids(v)


class BatchMoveRequest(BaseModel):
    ids: list[int]
    target_drive: str | None = None
    target_folder_path: str

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[int]) -> list[int]:
        return _validate_batch_ids(v)


class BatchTagRequest(BaseModel):
    ids: list[int]
    tags: list[str]

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[int]) -> list[int]:
        return _validate_batch_ids(v)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Maximum 10 tags")
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


def file_to_response(file) -> FileResponse:
    return FileResponse(
        id=file.id,
        filename=file.filename,
        title=file.title,
        description=file.description,
        drive=file.drive,
        folder_path=file.folder_path,
        file_type=file.file_type,
        mime_type=file.mime_type,
        thumbnail_url=f"/api/files/{file.id}/thumbnail",
        file_size=file.file_size,
        duration=file.duration,
        likes=file.likes,
        dislikes=file.dislikes,
        is_favorite=file.is_favorite,
        tags=[tag.name for tag in file.tags],
        created_at=file.created_at,
        updated_at=file.updated_at,
    )
