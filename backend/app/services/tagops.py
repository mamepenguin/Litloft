"""Tag rows that outlive the files that referenced them."""

from sqlalchemy.orm import Session

from app.models import Tag, file_tags


def cleanup_orphan_tags(db: Session, drive: str | None = None) -> int:
    """Remove Tag rows no longer referenced by any file. Returns count deleted.

    Transactional contract: caller commits. Symmetric with
    ``replace_file_tags`` so the two helpers always compose inside a
    single transaction.

    ``db.flush()`` first so pending ``file.tags = [...]`` reassignments
    from ``replace_file_tags`` are written to the ``file_tags`` table
    before the OUTER JOIN query runs. Without the flush, SQLAlchemy
    keeps the association change in the session and the orphan query
    reads a stale snapshot.

    ``drive`` confines the sweep to one drive. Callers acting on a single
    drive pass it so the transaction writes nothing outside that drive.
    """
    db.flush()
    query = db.query(Tag).outerjoin(file_tags).filter(file_tags.c.file_id.is_(None))
    if drive is not None:
        query = query.filter(Tag.drive == drive)
    orphans = query.all()
    for orphan in orphans:
        db.delete(orphan)
    return len(orphans)
