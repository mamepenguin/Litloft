from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

file_tags = Table(
    "file_tags",
    Base.metadata,
    Column("file_id", Integer, ForeignKey("files.id", ondelete="CASCADE"), primary_key=True),
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
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
    dislikes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    tags: Mapped[list[Tag]] = relationship(
        "Tag", secondary=file_tags, back_populates="files", lazy="selectin"
    )

    __table_args__ = (
        Index("idx_files_drive_folder_path", "drive", "folder_path"),
        Index("idx_files_title", "title"),
        Index("idx_files_is_favorite", "is_favorite"),
        Index("idx_files_file_type", "file_type"),
    )
