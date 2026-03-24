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

video_tags = Table(
    "video_tags",
    Base.metadata,
    Column("video_id", Integer, ForeignKey("videos.id", ondelete="CASCADE"), primary_key=True),
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

    videos: Mapped[list["Video"]] = relationship(
        "Video", secondary=video_tags, back_populates="tags"
    )

    __table_args__ = (
        UniqueConstraint("drive", "name", name="uq_tags_drive_name"),
    )


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    drive: Mapped[str] = mapped_column(String, nullable=False, default="")
    folder_path: Mapped[str] = mapped_column(String, nullable=False, default="")
    file_path: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String, nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
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
        "Tag", secondary=video_tags, back_populates="videos", lazy="selectin"
    )

    __table_args__ = (
        Index("idx_videos_drive_folder_path", "drive", "folder_path"),
        Index("idx_videos_title", "title"),
        Index("idx_videos_is_favorite", "is_favorite"),
    )
