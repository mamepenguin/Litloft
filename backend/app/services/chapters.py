from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Sequence, TypedDict

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import File, FileChapter
from app.services.filetype import LOFT_MIME_TYPE, is_probeable_media
from app.services.thumbnail import get_media_chapters


ChapterSource = Literal["extracted", "curated"]


class ChapterRow(TypedDict):
    start_time: float
    end_time: float | None
    title: str
    ordering: int


def replace_chapters(
    db: Session,
    file_id: str,
    chapters: Sequence[ChapterRow] | None,
    source: ChapterSource,
) -> None:
    """Replace one file's chapter set without discarding stronger data.

    The caller owns the surrounding transaction. This function never commits,
    so deleting the old set and inserting the new one either commit together or
    roll back together with the caller's ingest operation.
    """
    if not chapters:
        return

    if source not in ("extracted", "curated"):
        raise ValueError(f"Unsupported chapter source: {source}")

    if source == "extracted":
        curated_exists = db.scalar(
            select(FileChapter.id)
            .where(
                FileChapter.file_id == file_id,
                FileChapter.source == "curated",
            )
            .limit(1)
        )
        if curated_exists is not None:
            return

    new_rows = [
        FileChapter(
            file_id=file_id,
            start_time=chapter["start_time"],
            end_time=chapter["end_time"],
            title=chapter["title"],
            ordering=chapter["ordering"],
            source=source,
        )
        for chapter in chapters
    ]

    db.execute(delete(FileChapter).where(FileChapter.file_id == file_id))
    db.add_all(new_rows)


def probe_file_chapters(db: Session, file: File, media_path: Path) -> bool:
    """Probe and stamp one file once, returning whether the stamp changed."""
    if file.chapters_probed_at is not None:
        return False

    if file.mime_type == LOFT_MIME_TYPE:
        file.chapters_probed_at = datetime.now(UTC)
        return True

    if not is_probeable_media(file.file_type, file.mime_type):
        return False

    chapters = get_media_chapters(str(media_path))
    replace_chapters(db, file.id, chapters, "extracted")
    file.chapters_probed_at = datetime.now(UTC)
    return True
