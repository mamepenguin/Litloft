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
    file_path: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=False, default="other")
    mime_type: Mapped[str] = mapped_column(String, nullable=False, default="application/octet-stream")
    thumbnail_path: Mapped[str | None] = mapped_column(String, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
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

    tags: Mapped[list[Tag]] = relationship(
        "Tag", secondary=file_tags, back_populates="files", lazy="selectin"
    )

    __table_args__ = (
        Index("idx_files_drive_folder_path", "drive", "folder_path"),
        Index("idx_files_title", "title"),
        Index("idx_files_is_favorite", "is_favorite"),
        Index("idx_files_file_type", "file_type"),
        Index("idx_files_deleted_at", "deleted_at"),
        Index("idx_files_missing_since", "missing_since"),
        Index("idx_files_file_hash", "file_hash"),
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


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=generate_nanoid)
    drive: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    items: Mapped[list["PlaylistItem"]] = relationship(
        "PlaylistItem", back_populates="playlist", cascade="all, delete-orphan",
        lazy="selectin", order_by="PlaylistItem.position"
    )

    __table_args__ = (
        UniqueConstraint("drive", "name", name="uq_playlists_drive_name"),
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


class PlaylistItem(Base):
    __tablename__ = "playlist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    playlist_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )

    playlist: Mapped["Playlist"] = relationship("Playlist", back_populates="items")
    file: Mapped["File"] = relationship("File", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("playlist_id", "file_id", name="uq_playlist_items_playlist_file"),
        Index("idx_playlist_items_playlist_id", "playlist_id"),
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


class FileActiveSummary(Base):
    __tablename__ = "file_active_summaries"

    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True
    )
    summary_file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    set_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        Index("idx_active_summaries_summary", "summary_file_id"),
    )


def active_file_filter():
    """Filter condition matching only active files (not trashed, not missing).

    Use this in queries for file lists, searches, counts, etc. where
    soft-deleted (trash) and missing files should be excluded.
    """
    return and_(File.deleted_at.is_(None), File.missing_since.is_(None))
