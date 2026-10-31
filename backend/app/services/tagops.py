"""Tag rows that outlive the files that referenced them."""

from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import File, Tag, file_tags


class TagIndex:
    """One drive's tag rows, looked up by name.

    A name resolves to the row spelled exactly that way if there is one,
    otherwise to the lowest-id row whose ``name.lower()`` is the same. Both
    sides are folded in Python: SQLite's ``lower()`` folds ASCII only, so a
    SQL comparison never matches ``Übung`` with ``übung``.

    Rows not yet flushed (``id`` is None) count as newer than any stored row.
    """

    def __init__(self, tags: Iterable[Tag] = ()) -> None:
        self._exact: dict[str, Tag] = {}
        self._folded: dict[str, Tag] = {}
        for tag in sorted(tags, key=lambda t: (t.id is None, t.id or 0)):
            self.add(tag)

    def add(self, tag: Tag) -> None:
        self._exact.setdefault(tag.name, tag)
        self._folded.setdefault(tag.name.lower(), tag)

    def get(self, name: str) -> Tag | None:
        return self._exact.get(name) or self._folded.get(name.lower())


def resolve_tag(tags: Iterable[Tag], name: str) -> Tag | None:
    """The row of ``tags`` (one drive's rows) that ``name`` resolves to."""
    return TagIndex(tags).get(name)


def load_tag_index(db: Session, drive: str) -> TagIndex:
    """Index every Tag row of ``drive``; one query however many names follow."""
    return TagIndex(db.query(Tag).filter(Tag.drive == drive).all())


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
    Every drive the file's old rows belonged to, ``src_drive`` and
    ``dst_drive`` included, is swept of rows it leaves unreferenced.

    Transactional contract: caller commits. Call it before ``file.drive`` is
    reassigned, with ``src_drive`` the drive the file is leaving.
    """
    if src_drive == dst_drive:
        return
    # Pending deletes (an orphan swept earlier in the same transaction) must
    # reach the database first, or a row about to be deleted gets attached.
    db.flush()
    dst_index = load_tag_index(db, dst_drive)
    left_drives = {src_drive} | {tag.drive for tag in file.tags}
    retargeted: list[Tag] = []
    for tag in file.tags:
        row = dst_index.get(tag.name)
        if row is None:
            row = Tag(name=tag.name, drive=dst_drive)
            dst_index.add(row)
        if not any(row is kept for kept in retargeted):
            retargeted.append(row)
    file.tags = retargeted
    for drive in sorted(left_drives):
        cleanup_orphan_tags(db, drive)
