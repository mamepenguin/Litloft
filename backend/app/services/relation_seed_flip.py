"""Turn relation rows seeded as (source, note) into the note's own link rows."""
from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path

from sqlalchemy.orm import Session

import app.config as config
from app.models import File, FileRelation, active_file_filter
from app.services.markdown_relations import (
    MARKDOWN_ORIGIN,
    _md_predicate,
    direct_reference_ids,
)

logger = logging.getLogger(__name__)

_MAX_MARKDOWN_BYTES = 1_000_000


def _read_markdown(file: File) -> str | None:
    try:
        path = Path(config.get_drive_path(file.drive)) / file.file_path
        if path.stat().st_size > _MAX_MARKDOWN_BYTES:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError, ValueError):
        return None


def _flip_for_note(db: Session, note: File, seeds: list[FileRelation]) -> None:
    content = _read_markdown(note)
    if content is None:
        return
    cited = direct_reference_ids(content, note.id)
    for seed in seeds:
        if seed.file_id_a not in cited:
            continue
        own = (
            db.query(FileRelation)
            .filter(
                FileRelation.file_id_a == note.id,
                FileRelation.file_id_b == seed.file_id_a,
                FileRelation.kind == "related",
            )
            .first()
        )
        if own is None:
            db.add(
                FileRelation(
                    file_id_a=note.id,
                    file_id_b=seed.file_id_a,
                    kind="related",
                    origin=MARKDOWN_ORIGIN,
                    created_at=seed.created_at,
                    created_by=seed.created_by,
                )
            )
        else:
            own.origin = MARKDOWN_ORIGIN
        db.delete(seed)


def flip_cited_seed_relations(db: Session) -> None:
    """Replace each unmarked (S, N) row with a marked (N, S) row when N cites S.

    Only ``loft://`` links and ``source_file_ids`` count, so no wiki target is
    resolved. A note that cannot be read keeps its rows. Safe to run on every
    start: once flipped, a row no longer matches.
    """
    rows = (
        db.query(FileRelation, File)
        .join(File, File.id == FileRelation.file_id_b)
        .filter(
            FileRelation.kind == "related",
            FileRelation.origin.is_(None),
            active_file_filter(),
            _md_predicate(),
        )
        .all()
    )
    by_note: dict[str, tuple[File, list[FileRelation]]] = {}
    seeds: dict[str, list[FileRelation]] = defaultdict(list)
    for relation, note in rows:
        by_note[note.id] = (note, seeds[note.id])
        seeds[note.id].append(relation)

    for note, note_seeds in by_note.values():
        try:
            _flip_for_note(db, note, note_seeds)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("relation seed flip failed for %s", note.id)
