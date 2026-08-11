from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, Sequence, TypedDict

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


def normalise_chapters(
    raw: Iterable[Mapping[str, Any]] | None,
) -> list[ChapterRow]:
    """Apply the rules every producer shares, whatever it extracted from.

    Producers differ in where a chapter's parts live — ffprobe puts the
    title under ``tags``, yt-dlp puts it at the top level — so extraction
    stays with each producer. What must not differ is what happens next:

    * an entry with no usable title is dropped. An untitled marker is not
      something a person can navigate by, and rendering a blank row is
      worse than rendering nothing;
    * times are coerced, and an entry whose start will not coerce — or
      coerces to something that is not a finite number — is dropped
      rather than guessed at. ``float()`` accepts ``"nan"`` and
      ``"inf"``, and this is an external-input boundary: the addon hands
      yt-dlp's values straight to it. Neither survives the round trip.
      SQLite stores NaN as NULL, so a NaN start violates the column's
      NOT NULL and takes the whole ingest transaction down with it;
      Infinity stores fine and then breaks JSON encoding on read, which
      is worse — the chapter endpoint 500s for that file until someone
      deletes the row. An unusable end is nulled rather than costing the
      row, matching how a missing end is already treated;
    * ``ordering`` is assigned **after** filtering, so it stays
      contiguous. Sorting only cares about relative values, but a caller
      that reads it as "chapter N of M" would be wrong about a set with
      holes in it.

    Kept here rather than beside either prober because a second
    implementation of these three rules is how the two producers would
    start disagreeing about the same file.
    """
    rows: list[ChapterRow] = []
    for entry in raw or ():
        title = entry.get("title")
        if not isinstance(title, str) or not title.strip():
            continue

        try:
            start_time = float(entry["start_time"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(start_time):
            continue

        end_raw = entry.get("end_time")
        try:
            end_time = float(end_raw) if end_raw is not None else None
        except (TypeError, ValueError):
            end_time = None
        if end_time is not None and not math.isfinite(end_time):
            end_time = None

        rows.append(
            {
                "start_time": start_time,
                "end_time": end_time,
                "title": title.strip(),
                "ordering": len(rows),
            }
        )
    return rows


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

    raw = get_media_chapters(str(media_path))
    # ``None`` means the probe said nothing — it failed, or timed out.
    # That is not the same claim as "this file has no chapters", and
    # ``replace_chapters`` refuses to act on either, so both leave any
    # existing set alone.
    replace_chapters(db, file.id, normalise_chapters(raw), "extracted")
    file.chapters_probed_at = datetime.now(UTC)
    return True
