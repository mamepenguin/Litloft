"""Tag rows that outlive the files that referenced them."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import File, Tag, file_tags


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


def retarget_file_tags(db: Session, file: File, src_drive: str, dst_drive: str) -> None:
    """Replace ``file.tags`` with ``dst_drive``'s Tag rows of the same names.

    A destination row is reused as it stands, so its spelling is never
    rewritten; a name with no row there gets one in the source's spelling.
    Source rows the file leaves unreferenced are removed.

    Transactional contract: caller commits. Call it before ``file.drive`` is
    reassigned, with ``src_drive`` the drive the tags currently belong to.
    """
    if src_drive == dst_drive:
        return
    retargeted: dict[str, Tag] = {}
    for tag in file.tags:
        key = tag.name.lower()
        if key in retargeted:
            continue
        dst_tag = (
            db.query(Tag)
            .filter(func.lower(Tag.name) == key, Tag.drive == dst_drive)
            .first()
        )
        retargeted[key] = dst_tag or Tag(name=tag.name, drive=dst_drive)
    file.tags = list(retargeted.values())
    cleanup_orphan_tags(db, src_drive)
