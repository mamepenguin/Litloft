import re
from datetime import UTC, datetime

from pydantic import BaseModel, field_validator, model_serializer


class _UtcDateTimeMixin:
    """Ensure naive datetimes from SQLite are serialized with UTC timezone."""

    @model_serializer(mode="wrap")
    def _serialize_utc(self, handler):
        data = handler(self)
        for key, value in data.items():
            if isinstance(value, datetime) and value.tzinfo is None:
                data[key] = value.replace(tzinfo=UTC)
        return data


class FileResponse(_UtcDateTimeMixin, BaseModel):
    id: str
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
            tag = tag.strip()
            if not tag:
                continue
            if len(tag) > 30:
                raise ValueError(f"Tag '{tag}' exceeds 30 characters")
            if not re.match(r"^[\w\-]+$", tag, re.UNICODE):
                raise ValueError(f"Tag '{tag}' contains invalid characters")
            normalized.append(tag)
        seen: dict[str, str] = {}
        for tag in normalized:
            key = tag.lower()
            if key not in seen:
                seen[key] = tag
        return list(seen.values())


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int


class PaginatedResponse(BaseModel):
    data: list[FileResponse]
    meta: PaginationMeta


class DriveResponse(BaseModel):
    name: str
    protected: bool = False


class FolderResponse(BaseModel):
    name: str
    path: str
    file_count: int


class TagResponse(BaseModel):
    name: str
    count: int


class PinnedFolderResponse(BaseModel):
    path: str


class PinnedFolderCreateRequest(BaseModel):
    path: str


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


_NANOID_RE = re.compile(r"^[A-Za-z0-9_-]{12}$")


def _validate_batch_ids(v: list[str]) -> list[str]:
    if not v:
        raise ValueError("At least one file ID is required")
    if len(v) > 100:
        raise ValueError("Maximum 100 files per batch operation")
    for fid in v:
        if not _NANOID_RE.match(fid):
            raise ValueError(f"Invalid file ID: {fid}")
    return v


class BatchIdsRequest(BaseModel):
    ids: list[str]

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[str]) -> list[str]:
        return _validate_batch_ids(v)


class BatchMoveRequest(BaseModel):
    ids: list[str]
    target_drive: str | None = None
    target_folder_path: str

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[int]) -> list[int]:
        return _validate_batch_ids(v)


class BatchTagRequest(BaseModel):
    ids: list[str]
    tags: list[str]

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[str]) -> list[str]:
        return _validate_batch_ids(v)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Maximum 10 tags")
        normalized = []
        for tag in v:
            tag = tag.strip()
            if not tag:
                continue
            if len(tag) > 30:
                raise ValueError(f"Tag '{tag}' exceeds 30 characters")
            if not re.match(r"^[\w\-]+$", tag, re.UNICODE):
                raise ValueError(f"Tag '{tag}' contains invalid characters")
            normalized.append(tag)
        seen: dict[str, str] = {}
        for tag in normalized:
            key = tag.lower()
            if key not in seen:
                seen[key] = tag
        return list(seen.values())


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
        is_favorite=file.is_favorite,
        tags=[tag.name for tag in file.tags],
        created_at=file.created_at,
        updated_at=file.updated_at,
    )
