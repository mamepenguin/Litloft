"""Mark relation rows written by Markdown link sync before ``origin`` existed."""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy.orm import Session, aliased

import app.config as config
from app.models import File, FileRelation, active_file_filter
from app.services.markdown_relations import (
    MARKDOWN_ORIGIN,
    _md_predicate,
    sync_markdown_file_relations,
)

logger = logging.getLogger(__name__)

SENTINEL_NAME = "relations_origin_v1_done"
_MAX_MARKDOWN_BYTES = 1_000_000


def _read_markdown(file: File) -> str | None:
    try:
        path = Path(config.get_drive_path(file.drive)) / file.file_path
        if path.stat().st_size > _MAX_MARKDOWN_BYTES:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError, ValueError):
        return None


def _remove_seeds_duplicated_by_markdown(db: Session, synced_ids: set[str], unread_ids: set[str]) -> None:
    """Drop an unmarked (T, N) row when N's own sync wrote (N, T)."""
    marked = aliased(FileRelation)
    duplicates = (
        db.query(FileRelation)
        .join(
            marked,
            (marked.file_id_a == FileRelation.file_id_b)
            & (marked.file_id_b == FileRelation.file_id_a)
            & (marked.kind == FileRelation.kind),
        )
        .filter(
            FileRelation.kind == "related",
            FileRelation.origin.is_(None),
            marked.origin == MARKDOWN_ORIGIN,
        )
        .all()
    )
    for row in duplicates:
        if row.file_id_b in synced_ids and row.file_id_a not in unread_ids:
            db.delete(row)
    db.commit()


def backfill_markdown_relation_origin(db: Session) -> bool:
    """Return True once every active Markdown file has been resynced."""
    sentinel = config.DATA_DIR / SENTINEL_NAME
    if sentinel.exists():
        return True

    notes = db.query(File).filter(active_file_filter(), _md_predicate()).all()
    synced_ids: set[str] = set()
    unread_ids: set[str] = set()
    for note in notes:
        content = _read_markdown(note)
        if content is None:
            unread_ids.add(note.id)
            continue
        try:
            sync_markdown_file_relations(
                db, note.id, note.drive, content, note.folder_path,
                claim_unmarked=True,
            )
            db.commit()
            synced_ids.add(note.id)
        except Exception:
            db.rollback()
            unread_ids.add(note.id)
            logger.exception("relation origin backfill failed for %s", note.id)

    _remove_seeds_duplicated_by_markdown(db, synced_ids, unread_ids)

    if unread_ids:
        logger.warning(
            "relation origin backfill: %d Markdown files unreadable; retrying on next start",
            len(unread_ids),
        )
        return False
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    sentinel.touch()
    return True
