import re
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class _UtcDateTimeMixin:
    """Ensure naive datetimes from SQLite are treated as UTC."""

    @model_validator(mode="after")
    def _attach_utc(self):
        for name, field_info in self.model_fields.items():
            value = getattr(self, name)
            if isinstance(value, datetime) and value.tzinfo is None:
                object.__setattr__(self, name, value.replace(tzinfo=UTC))
        return self


class SubtitleInfo(BaseModel):
    index: int
    language: str
    format: str
    label: str


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
    has_thumbnail: bool
    file_size: int
    duration: float | None
    likes: int
    is_favorite: bool
    tags: list[str]
    subtitles: list[SubtitleInfo] = []
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    missing_since: datetime | None = None
    # Set only by /api/drives/{name}/files when ``search`` matches: tells
    # the frontend whether the hit came from the title (filename engine),
    # the folder_path, or both — drives the per-card "ファイル名 / パス"
    # badge mix. Spec ``2026-05-02-search-path-match.md``.
    match_source: str | None = None

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


class ArchiveEntryResponse(BaseModel):
    path: str
    filename: str
    file_size: int
    compressed_size: int
    file_type: str
    mime_type: str
    is_dir: bool


class ArchiveContentsResponse(BaseModel):
    entries: list[ArchiveEntryResponse]
    total_entries: int
    total_size: int


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int


class PaginatedResponse(BaseModel):
    data: list[FileResponse]
    meta: PaginationMeta


class NeighborsResponse(BaseModel):
    prev_id: str | None
    next_id: str | None


class DriveResponse(BaseModel):
    name: str
    protected: bool = False


class DriveSummaryResponse(BaseModel):
    name: str
    trash_count: int
    missing_count: int


class FolderResponse(BaseModel):
    name: str
    path: str
    file_count: int
    thumbnail_file_id: str | None


class TagResponse(BaseModel):
    name: str
    count: int


class PinnedFolderResponse(BaseModel):
    path: str


class PinnedFolderCreateRequest(BaseModel):
    path: str


class ScanResponse(BaseModel):
    added: int
    missing: int = 0
    recovered: int = 0
    updated: int = 0
    total: int


class UploadInitRequest(BaseModel):
    filename: str
    file_size: int
    folder_path: str = ""
    relative_path: str = ""
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


class TextFileCreateRequest(BaseModel):
    path: str
    content: str = ""


class FolderRenameRequest(BaseModel):
    path: str
    new_name: str


class FolderMoveRequest(BaseModel):
    path: str
    target_path: str


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


class FileCopyRequest(BaseModel):
    target_folder_path: str = Field(..., max_length=1000)
    target_drive: str | None = Field(None, max_length=100)


class BatchCopyRequest(BaseModel):
    ids: list[str]
    target_folder_path: str = Field(..., max_length=1000)
    target_drive: str | None = Field(None, max_length=100)

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[str]) -> list[str]:
        return _validate_batch_ids(v)


class BatchCopyResponse(BaseModel):
    copied: int
    errors: list[dict]


class BatchRenameItem(BaseModel):
    id: str
    old_name: str
    new_name: str


class BatchRenameResponse(BaseModel):
    renamed: int
    results: list[BatchRenameItem]


class BatchRenameRequest(BaseModel):
    ids: list[str]
    mode: str
    # template mode
    template: str | None = Field(None, max_length=500)
    start_number: int = Field(default=1, ge=0, le=999999)
    zero_pad: int = Field(default=1, ge=1, le=10)
    # regex mode
    pattern: str | None = Field(None, max_length=200)
    replacement: str | None = Field(None, max_length=500)
    # prefix_suffix mode
    action: str | None = None
    value: str | None = Field(None, max_length=500)

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, v: list[str]) -> list[str]:
        return _validate_batch_ids(v)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("template", "regex", "prefix_suffix"):
            raise ValueError("mode must be 'template', 'regex', or 'prefix_suffix'")
        return v

    @model_validator(mode="after")
    def validate_mode_fields(self):
        if self.mode == "template":
            if not self.template:
                raise ValueError("template is required for template mode")
        elif self.mode == "regex":
            if self.pattern is None:
                raise ValueError("pattern is required for regex mode")
            if self.replacement is None:
                raise ValueError("replacement is required for regex mode")
        elif self.mode == "prefix_suffix":
            valid_actions = ("add_prefix", "add_suffix", "remove_prefix", "remove_suffix")
            if self.action not in valid_actions:
                raise ValueError(f"action must be one of {valid_actions}")
            if self.value is None:
                raise ValueError("value is required for prefix_suffix mode")
        return self


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


class ProgressUpdateRequest(BaseModel):
    # Both fields Optional so the same endpoint serves two use cases:
    # media playback (position+duration required) and "page-opened"
    # view records for non-media files (both omitted, only
    # last_played_at advances). Mixing — sending only one — is rejected
    # to keep WatchHistory rows consistent. See spec
    # ``2026-04-26-intelligence-ask-personal-history-query.md`` §4.2
    # Stage B for why text/image/PDF files must also surface here.
    position: float | None = None
    duration: float | None = None

    @field_validator("position")
    @classmethod
    def validate_position(cls, v: float | None) -> float | None:
        if v is None:
            return v
        import math
        if not math.isfinite(v):
            raise ValueError("position must be a finite number")
        if v < 0 or v > 86400:
            raise ValueError("position must be between 0 and 86400")
        return v

    @field_validator("duration")
    @classmethod
    def validate_duration(cls, v: float | None) -> float | None:
        if v is None:
            return v
        import math
        if not math.isfinite(v):
            raise ValueError("duration must be a finite number")
        if v <= 0 or v > 86400:
            raise ValueError("duration must be between 0 and 86400")
        return v

    @model_validator(mode="after")
    def position_within_duration(self):
        # All-or-nothing: sending only one of {position, duration}
        # leaves the WatchHistory row in an undefined state (e.g. a
        # position with no duration cannot be checked against the
        # 90% completion gate in drives.py:570). Reject early so the
        # endpoint contract stays explicit.
        if (self.position is None) != (self.duration is None):
            raise ValueError(
                "position and duration must be sent together or both omitted"
            )
        if self.position is not None and self.duration is not None:
            if self.position > self.duration:
                raise ValueError("position cannot exceed duration")
        return self


class ProgressResponse(BaseModel):
    position: float
    duration: float


class WatchProgressInfo(BaseModel):
    position: float
    duration: float


class WatchHistoryItemResponse(_UtcDateTimeMixin, BaseModel):
    id: str
    filename: str
    title: str
    description: str
    drive: str
    folder_path: str
    file_type: str
    mime_type: str
    thumbnail_url: str
    has_thumbnail: bool
    file_size: int
    duration: float | None
    likes: int
    is_favorite: bool
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    watch_progress: WatchProgressInfo

    model_config = {"from_attributes": True}


class WatchHistoryResponse(BaseModel):
    data: list[WatchHistoryItemResponse]


class PlaylistCreateRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Playlist name is required")
        if len(v) > 100:
            raise ValueError("Playlist name exceeds 100 characters")
        return v


class PlaylistUpdateRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Playlist name is required")
        if len(v) > 100:
            raise ValueError("Playlist name exceeds 100 characters")
        return v


class PlaylistItemAddRequest(BaseModel):
    file_ids: list[str]

    @field_validator("file_ids")
    @classmethod
    def validate_file_ids(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one file ID is required")
        if len(v) > 100:
            raise ValueError("Maximum 100 files per operation")
        for fid in v:
            if not _NANOID_RE.match(fid):
                raise ValueError(f"Invalid file ID: {fid}")
        return v


class PlaylistItemReorderRequest(BaseModel):
    item_ids: list[int]

    @field_validator("item_ids")
    @classmethod
    def validate_item_ids(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("At least one item ID is required")
        return v


class PlaylistItemResponse(BaseModel):
    id: int
    position: int
    file: FileResponse


class PlaylistSummaryResponse(_UtcDateTimeMixin, BaseModel):
    id: str
    name: str
    drive: str
    item_count: int
    first_file_id: str | None
    created_at: datetime
    updated_at: datetime


class PlaylistDetailResponse(_UtcDateTimeMixin, BaseModel):
    id: str
    name: str
    drive: str
    items: list[PlaylistItemResponse]
    created_at: datetime
    updated_at: datetime


class DashboardDriveInfo(BaseModel):
    name: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    file_count: int
    file_types: dict[str, int]
    last_scanned_at: datetime | None = None
    is_scanning: bool


class DashboardSystemInfo(BaseModel):
    db_size_bytes: int
    thumbnail_cache_bytes: int
    converted_cache_bytes: int
    upload_temp_bytes: int
    total_files: int
    trash_count: int
    missing_count: int = 0
    uptime_seconds: float


class DashboardResponse(_UtcDateTimeMixin, BaseModel):
    drives: list[DashboardDriveInfo]
    system: DashboardSystemInfo


class DuplicateGroup(BaseModel):
    hash: str
    total_size: int
    files: list[FileResponse]


class DuplicatesResponse(BaseModel):
    groups: list[DuplicateGroup]
    total_groups: int
    total_wasted_bytes: int


class BatchRestoreResponse(BaseModel):
    restored: int
    errors: list[dict]


class BatchPurgeResponse(BaseModel):
    purged: int
    errors: list[dict]


# Strip dangerous control characters but keep newlines and tabs
_CONTROL_CHAR_RE = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f"
    r"\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]"
)


def _sanitize_comment_body(v: str) -> str:
    v = _CONTROL_CHAR_RE.sub("", v)
    v = v.strip()
    if not v:
        raise ValueError("Comment body is required")
    return v


class CommentCreateRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)

    @field_validator("body")
    @classmethod
    def validate_body(cls, v: str) -> str:
        return _sanitize_comment_body(v)


class CommentUpdateRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)

    @field_validator("body")
    @classmethod
    def validate_body(cls, v: str) -> str:
        return _sanitize_comment_body(v)


class CommentResponse(_UtcDateTimeMixin, BaseModel):
    id: str
    nickname: str | None
    body: str
    is_mine: bool
    created_at: datetime
    updated_at: datetime


class CommentsListResponse(BaseModel):
    comments: list[CommentResponse]
    total: int


class RelatedFileSummary(_UtcDateTimeMixin, BaseModel):
    """Compact view of a file shown in the Related Files section.

    Intentionally slimmer than ``FileResponse`` — no tags, subtitles, or
    description — because this payload is rendered as a compact card
    grid rather than a full detail panel.
    """

    id: str
    drive: str
    filename: str
    folder_path: str
    file_type: str
    mime_type: str
    thumbnail_url: str
    has_thumbnail: bool
    file_size: int
    missing_since: datetime | None = None
    created_at: datetime
    updated_at: datetime


class FileRelationItem(_UtcDateTimeMixin, BaseModel):
    relation_id: int
    kind: str
    created_at: datetime
    created_by: str | None = None
    file: RelatedFileSummary


class FileRelationsResponse(BaseModel):
    relations: list[FileRelationItem]


_SMART_FOLDER_FILE_TYPES = {"video", "image", "audio", "document"}
_SMART_FOLDER_SORT_ORDERS = {"asc", "desc"}


def _validate_smart_folder_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Smart folder name is required")
    if len(v) > 100:
        raise ValueError("Smart folder name exceeds 100 characters")
    return v


def _validate_smart_folder_query(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Smart folder query is required")
    if len(v) > 1000:
        raise ValueError("Smart folder query exceeds 1000 characters")
    return v


def _validate_optional_file_type(v: str | None) -> str | None:
    if v is None:
        return v
    if v not in _SMART_FOLDER_FILE_TYPES:
        raise ValueError(
            f"file_type must be one of {sorted(_SMART_FOLDER_FILE_TYPES)}"
        )
    return v


def _validate_optional_sort_order(v: str | None) -> str | None:
    if v is None:
        return v
    if v not in _SMART_FOLDER_SORT_ORDERS:
        raise ValueError(
            f"sort_order must be one of {sorted(_SMART_FOLDER_SORT_ORDERS)}"
        )
    return v


class SmartFolderCreate(BaseModel):
    name: str
    query: str
    file_type: str | None = None
    sort_by: str | None = Field(default=None, max_length=100)
    sort_order: str | None = None

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        return _validate_smart_folder_name(v)

    @field_validator("query")
    @classmethod
    def _v_query(cls, v: str) -> str:
        return _validate_smart_folder_query(v)

    @field_validator("file_type")
    @classmethod
    def _v_file_type(cls, v: str | None) -> str | None:
        return _validate_optional_file_type(v)

    @field_validator("sort_order")
    @classmethod
    def _v_sort_order(cls, v: str | None) -> str | None:
        return _validate_optional_sort_order(v)


class SmartFolderUpdate(BaseModel):
    name: str | None = None
    query: str | None = None
    file_type: str | None = None
    sort_by: str | None = Field(default=None, max_length=100)
    sort_order: str | None = None

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_smart_folder_name(v)

    @field_validator("query")
    @classmethod
    def _v_query(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_smart_folder_query(v)

    @field_validator("file_type")
    @classmethod
    def _v_file_type(cls, v: str | None) -> str | None:
        return _validate_optional_file_type(v)

    @field_validator("sort_order")
    @classmethod
    def _v_sort_order(cls, v: str | None) -> str | None:
        return _validate_optional_sort_order(v)


class SmartFolderResponse(_UtcDateTimeMixin, BaseModel):
    id: str
    drive: str
    name: str
    query: str
    file_type: str | None
    sort_by: str | None
    sort_order: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class ExifResponse(BaseModel):
    datetime_original: str | None
    make: str | None
    model: str | None
    f_number: float | None
    exposure_time: str | None
    iso_speed: int | None
    focal_length: float | None
    gps_lat: float | None
    gps_lon: float | None

    model_config = {"from_attributes": True}


def file_to_response(
    file,
    subtitles: list[SubtitleInfo] | None = None,
    match_source: str | None = None,
) -> FileResponse:
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
        has_thumbnail=file.thumbnail_path is not None,
        file_size=file.file_size,
        duration=file.duration,
        likes=file.likes,
        is_favorite=file.is_favorite,
        tags=[tag.name for tag in file.tags],
        subtitles=subtitles or [],
        created_at=file.created_at,
        updated_at=file.updated_at,
        deleted_at=file.deleted_at,
        missing_since=file.missing_since,
        match_source=match_source,
    )
