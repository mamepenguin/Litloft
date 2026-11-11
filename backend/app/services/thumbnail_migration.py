import logging
import os
import stat
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import update
from sqlalchemy.orm import Session

import app.config as config
from app.models import File
from app.services.thumbnail import prune_empty_dirs, thumbnail_slot_rel, SLOT_DIR

logger = logging.getLogger(__name__)

_MIGRATION_COMMIT_EVERY = 200
_MIGRATION_LOG_EVERY = 1000


def _reach_key(path: Path, rel: str) -> tuple:
    """What a pointer reaches. The cache's mount can fold case and Unicode
    normalisation, so two strings can name one file, and only the inode tells.

    A missing path, or something that is not a regular file, means there is no
    picture. Any other failure leaves it unknown, and an unknown file must keep
    its pointer."""
    try:
        st = path.stat()
    except (FileNotFoundError, NotADirectoryError):
        return ("absent", rel)
    except OSError:
        return ("unknown", rel)
    if not stat.S_ISREG(st.st_mode):
        return ("absent", rel)
    return ("inode", st.st_dev, st.st_ino)


def _is_path_form(rel: str) -> bool:
    if rel.startswith(f"{SLOT_DIR}/"):
        return False
    parts = rel.split("/")
    return not (len(parts) > 1 and parts[1] == ".markdown")


def _set_pointer(db: Session, file_id: str, value: str | None) -> None:
    db.execute(
        update(File)
        .where(File.id == file_id)
        .values(thumbnail_path=value, updated_at=File.updated_at)
    )


def migrate_thumbnail_slots(session_factory: Callable[[], Session]) -> dict[str, int]:
    """Move every path-form thumbnail to its row's slot.

    A picture named by one row moves; a picture several rows name could belong
    to any of them, so none keeps it. Safe to stop anywhere: a row whose file
    already moved is repointed at its slot by the next run.
    """
    counts = {"moved": 0, "emptied": 0, "failed": 0}
    thumbs = config.THUMBNAILS_DIR

    db = session_factory()
    try:
        rows = [
            (row.id, row.thumbnail_path)
            for row in db.query(File.id, File.thumbnail_path)
            .filter(File.thumbnail_path.isnot(None), File.thumbnail_path != "")
            .all()
            if _is_path_form(row.thumbnail_path)
        ]
        if not rows:
            return counts
        logger.info("Thumbnail migration: %d rows to examine", len(rows))

        groups: dict[tuple, list[tuple[str, str]]] = {}
        for file_id, rel in rows:
            groups.setdefault(_reach_key(thumbs / rel, rel), []).append((file_id, rel))

        pending = 0
        examined = 0
        for key, members in groups.items():
            if key[0] == "unknown":
                for file_id, rel in members:
                    logger.warning(
                        "Could not examine thumbnail %s of file %s; keeping its pointer",
                        rel,
                        file_id,
                    )
                counts["failed"] += len(members)
                examined += len(members)
                continue
            if len(members) > 1:
                for file_id, _ in members:
                    _set_pointer(db, file_id, None)
                db.commit()
                pending = 0
                counts["emptied"] += len(members)
                if key[0] == "inode":
                    for rel in {rel for _, rel in members}:
                        try:
                            (thumbs / rel).unlink(missing_ok=True)
                            prune_empty_dirs((thumbs / rel).parent, thumbs)
                        except OSError:
                            logger.warning("Could not remove shared thumbnail %s", rel)
                            counts["failed"] += 1
            else:
                file_id, rel = members[0]
                slot_rel = thumbnail_slot_rel(file_id)
                slot = thumbs / slot_rel
                if key[0] == "inode":
                    try:
                        slot.parent.mkdir(parents=True, exist_ok=True)
                        os.replace(thumbs / rel, slot)
                    except OSError:
                        logger.warning(
                            "Could not move thumbnail %s of file %s to its slot", rel, file_id
                        )
                        counts["failed"] += 1
                        examined += 1
                        continue
                    prune_empty_dirs((thumbs / rel).parent, thumbs)
                    _set_pointer(db, file_id, slot_rel)
                    counts["moved"] += 1
                elif slot.is_file():
                    _set_pointer(db, file_id, slot_rel)
                    counts["moved"] += 1
                else:
                    _set_pointer(db, file_id, None)
                    counts["emptied"] += 1
                pending += 1
                if pending >= _MIGRATION_COMMIT_EVERY:
                    db.commit()
                    pending = 0
            examined += len(members)
            if examined // _MIGRATION_LOG_EVERY != (examined - len(members)) // _MIGRATION_LOG_EVERY:
                logger.info("Thumbnail migration: %d of %d rows", examined, len(rows))
        db.commit()
    finally:
        db.close()
    logger.info(
        "Thumbnail migration done: moved %(moved)d, emptied %(emptied)d, failed %(failed)d",
        counts,
    )
    return counts
