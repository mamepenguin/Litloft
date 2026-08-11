from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    and_,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.nanoid import generate_nanoid

file_tags = Table(
    "file_tags",
    Base.metadata,
    Column("file_id", String(12), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    drive: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )

    files: Mapped[list["File"]] = relationship(
        "File", secondary=file_tags, back_populates="tags"
    )

    __table_args__ = (
        UniqueConstraint("drive", "name", name="uq_tags_drive_name"),
    )


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=generate_nanoid)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    drive: Mapped[str] = mapped_column(String, nullable=False, default="")
    folder_path: Mapped[str] = mapped_column(String, nullable=False, default="")
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=False, default="other")
    mime_type: Mapped[str] = mapped_column(String, nullable=False, default="application/octet-stream")
    thumbnail_path: Mapped[str | None] = mapped_column(String, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    chapters_probed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    likes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    missing_since: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    file_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    md_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )
    md_aliases: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    tags: Mapped[list[Tag]] = relationship(
        "Tag", secondary=file_tags, back_populates="files", lazy="selectin"
    )

    __table_args__ = (
        # A drive is a security boundary; ``file_path`` is stored
        # drive-relative (no drive prefix), so uniqueness is per-drive,
        # never global. Mirrors Tag / EmptyFolder / PinnedFolder /
        # Collection which are all UniqueConstraint("drive", ...).
        UniqueConstraint("drive", "file_path", name="uq_files_drive_file_path"),
        Index("idx_files_drive_folder_path", "drive", "folder_path"),
        Index("idx_files_title", "title"),
        Index("idx_files_is_favorite", "is_favorite"),
        Index("idx_files_file_type", "file_type"),
        Index("idx_files_deleted_at", "deleted_at"),
        Index("idx_files_missing_since", "missing_since"),
        Index("idx_files_file_hash", "file_hash"),
        Index("idx_files_drive_md_id", "drive", "md_id"),
    )


class EmptyFolder(Base):
    __tablename__ = "empty_folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    drive: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        UniqueConstraint("drive", "path", name="uq_empty_folders_drive_path"),
    )


class PinnedFolder(Base):
    __tablename__ = "pinned_folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    drive: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        UniqueConstraint("drive", "path", name="uq_pinned_folders_drive_path"),
    )


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=generate_nanoid)
    drive: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    items: Mapped[list["CollectionItem"]] = relationship(
        "CollectionItem", back_populates="collection", cascade="all, delete-orphan",
        lazy="selectin", order_by="CollectionItem.position"
    )

    __table_args__ = (
        UniqueConstraint("drive", "name", name="uq_collections_drive_name"),
    )


class WatchHistory(Base):
    __tablename__ = "watch_history"

    viewer_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True
    )
    playback_position: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    duration: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    last_played_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    file: Mapped["File"] = relationship("File", lazy="selectin")

    __table_args__ = (
        Index("idx_watch_history_viewer_last_played", "viewer_id", "last_played_at"),
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=generate_nanoid)
    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    viewer_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    file: Mapped["File"] = relationship("File", lazy="selectin")

    __table_args__ = (
        Index("idx_comments_file_id", "file_id"),
    )


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    collection_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )

    collection: Mapped["Collection"] = relationship("Collection", back_populates="items")
    file: Mapped["File"] = relationship("File", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("collection_id", "file_id", name="uq_collection_items_collection_file"),
        Index("idx_collection_items_collection_id", "collection_id"),
    )


class SmartFolder(Base):
    __tablename__ = "smart_folders"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=generate_nanoid)
    drive: Mapped[str] = mapped_column(String, nullable=False)
    viewer_id: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)
    name: Mapped[str] = mapped_column(String, nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    sort_by: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    sort_order: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None, onupdate=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        Index("idx_smart_folders_drive", "drive"),
    )


class FileRelation(Base):
    __tablename__ = "file_relations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id_a: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    file_id_b: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    created_by: Mapped[str | None] = mapped_column(String(16), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "file_id_a", "file_id_b", "kind", name="uq_file_relations_a_b_kind"
        ),
        CheckConstraint("file_id_a != file_id_b", name="ck_file_relations_not_self"),
        Index("idx_file_relations_a", "file_id_a", "kind"),
        Index("idx_file_relations_b", "file_id_b", "kind"),
    )


class FileChapter(Base):
    __tablename__ = "file_chapters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    ordering: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (
        Index("idx_file_chapters_file", "file_id", "ordering"),
    )


class FileExif(Base):
    __tablename__ = "file_exif"

    file_id: Mapped[str] = mapped_column(String(12), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True)
    datetime_original: Mapped[str | None] = mapped_column(String, nullable=True)
    make: Mapped[str | None] = mapped_column(String, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    f_number: Mapped[float | None] = mapped_column(Float, nullable=True)
    exposure_time: Mapped[str | None] = mapped_column(String, nullable=True)
    iso_speed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    focal_length: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    extracted_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


def active_file_filter():
    """Filter condition matching only active files (not trashed, not missing).

    Use this in queries for file lists, searches, counts, etc. where
    soft-deleted (trash) and missing files should be excluded.
    """
    return and_(File.deleted_at.is_(None), File.missing_since.is_(None))
