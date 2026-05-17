"""Regression + migration test: ``files.file_path`` UNIQUE must be
drive-scoped, not global.

Root cause: ``File.file_path`` carried a single-column ``unique=True``
(models.py) plus ``file_path VARCHAR NOT NULL UNIQUE`` in the legacy raw
CREATE TABLE statements (database.py). The scanner stores a
*drive-relative* path with no drive prefix (``"README.md"``), so two
different drives could never both hold a root ``README.md`` — the second
registration died with an IntegrityError surfaced to the user as 409.

Every other drive-partitioned table (Tag / EmptyFolder / PinnedFolder /
Collection) already uses a composite ``UniqueConstraint("drive", ...)``.
``files`` should match: ``UniqueConstraint("drive", "file_path")``.

SQLite note: an inline single-column ``UNIQUE`` creates an implicit
``sqlite_autoindex_files_*`` that cannot be ``DROP INDEX``-ed, so the
existing-DB migration must rebuild the table (the established Phase 3/4
pattern in database.py). Existing rows are data-safe: the old global
UNIQUE physically guaranteed no cross-drive duplicates, so every row
trivially satisfies ``(drive, file_path)`` already.
"""
import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import Base, _migrate
from app.models import File


def _enable_fk(engine):
    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _fresh_engine(tmp_path, name):
    engine = create_engine(
        f"sqlite:///{tmp_path / name}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    return engine


def _has_composite_unique(engine):
    inspector = inspect(engine)
    return any(
        sorted(u["column_names"]) == ["drive", "file_path"]
        for u in inspector.get_unique_constraints("files")
    )


# --- Fresh-install schema (Base.metadata.create_all path) ------------------


def test_fresh_db_allows_same_relative_path_across_drives(tmp_path):
    """Two drives can each hold a root ``README.md``."""
    engine = _fresh_engine(tmp_path, "fresh.db")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(File(filename="README.md", title="README", drive="photos",
                folder_path="", file_path="README.md", file_size=1))
    db.add(File(filename="README.md", title="README", drive="docs",
                folder_path="", file_path="README.md", file_size=1))
    db.commit()  # must NOT raise

    assert db.query(File).count() == 2
    db.close()


def test_fresh_db_still_rejects_duplicate_within_same_drive(tmp_path):
    """The constraint still prevents a true duplicate inside one drive."""
    engine = _fresh_engine(tmp_path, "dup.db")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(File(filename="a.md", title="a", drive="docs",
                folder_path="", file_path="a.md", file_size=1))
    db.commit()
    db.add(File(filename="a.md", title="a", drive="docs",
                folder_path="", file_path="a.md", file_size=1))
    with pytest.raises(IntegrityError):
        db.commit()
    db.close()


def test_fresh_db_has_composite_not_global_unique(tmp_path):
    engine = _fresh_engine(tmp_path, "shape.db")
    Base.metadata.create_all(bind=engine)
    assert _has_composite_unique(engine)


# --- Existing-DB migration (raw _migrate path) -----------------------------


def _legacy_files_ddl_global_unique() -> str:
    """``files`` schema as emitted by the pre-fix code: single-column
    global ``file_path ... UNIQUE`` plus every current column so the
    rebuild has to preserve all of them."""
    return """
        CREATE TABLE files (
            id VARCHAR(12) PRIMARY KEY,
            filename VARCHAR NOT NULL,
            title VARCHAR NOT NULL,
            description TEXT DEFAULT '',
            drive VARCHAR NOT NULL DEFAULT '',
            folder_path VARCHAR NOT NULL DEFAULT '',
            file_path VARCHAR NOT NULL UNIQUE,
            file_size INTEGER NOT NULL,
            file_type VARCHAR NOT NULL DEFAULT 'other',
            mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',
            thumbnail_path VARCHAR,
            duration FLOAT,
            likes INTEGER DEFAULT 0,
            is_favorite BOOLEAN DEFAULT 0,
            created_at DATETIME,
            updated_at DATETIME,
            deleted_at DATETIME,
            missing_since DATETIME,
            file_hash VARCHAR(64),
            md_id VARCHAR(32),
            md_aliases TEXT
        )
    """


def test_legacy_global_unique_migrated_to_composite(tmp_path):
    engine = _fresh_engine(tmp_path, "legacy.db")
    with engine.begin() as conn:
        conn.execute(text(_legacy_files_ddl_global_unique()))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, drive, folder_path,"
            " file_path, file_size) VALUES"
            " ('aaaaaaaaaaaa', 'README.md', 'README', 'photos', '',"
            " 'README.md', 10)"
        ))

    _migrate(engine)

    # Composite unique now present.
    assert _has_composite_unique(engine)
    # Original row preserved with all data intact.
    with engine.connect() as conn:
        rows = list(conn.execute(text(
            "SELECT id, drive, file_path, file_size FROM files"
        )))
    assert rows == [("aaaaaaaaaaaa", "photos", "README.md", 10)]

    # The whole point: a second drive can now take the same relative path.
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(File(filename="README.md", title="README", drive="docs",
                folder_path="", file_path="README.md", file_size=10))
    db.commit()  # must NOT raise
    assert db.query(File).filter(File.file_path == "README.md").count() == 2
    db.close()


def test_legacy_migration_preserves_later_columns(tmp_path):
    """All columns added by later ALTER phases survive the rebuild."""
    engine = _fresh_engine(tmp_path, "cols.db")
    with engine.begin() as conn:
        conn.execute(text(_legacy_files_ddl_global_unique()))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, drive, folder_path,"
            " file_path, file_size, file_hash, md_id, md_aliases,"
            " missing_since) VALUES"
            " ('bbbbbbbbbbbb', 'n.md', 'n', 'docs', 'sub',"
            " 'sub/n.md', 5, 'deadbeef', 'mid123', '[\"alias\"]', NULL)"
        ))

    _migrate(engine)

    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT file_hash, md_id, md_aliases FROM files"
            " WHERE id = 'bbbbbbbbbbbb'"
        )).fetchone()
    assert row == ("deadbeef", "mid123", '["alias"]')


def test_migration_is_idempotent(tmp_path):
    engine = _fresh_engine(tmp_path, "idem.db")
    with engine.begin() as conn:
        conn.execute(text(_legacy_files_ddl_global_unique()))
    _migrate(engine)
    _migrate(engine)  # must not raise / must not rebuild again
    assert _has_composite_unique(engine)


def test_migration_keeps_file_indexes(tmp_path):
    """Table rebuild must recreate the secondary indexes."""
    engine = _fresh_engine(tmp_path, "idx.db")
    with engine.begin() as conn:
        conn.execute(text(_legacy_files_ddl_global_unique()))
    _migrate(engine)
    inspector = inspect(engine)
    names = {i["name"] for i in inspector.get_indexes("files")}
    assert "idx_files_drive_folder_path" in names
    assert "idx_files_drive_md_id" in names


def test_migration_does_not_cascade_delete_child_rows(tmp_path):
    """THE critical invariant of this migration.

    ``DROP TABLE files`` with FK enforcement ON performs an implicit
    per-row DELETE that fires every ``ON DELETE CASCADE`` FK into
    file_tags / comments / file_relations / file_exif — wiping the user's
    tags, comments, relations and EXIF. The rebuild must turn FK
    enforcement OFF for the swap and preserve ids so child rows survive.
    Without this test a regression silently destroys user data on upgrade.
    """
    from app.models import (
        Comment,
        FileExif,
        FileRelation,
        Tag,
        file_tags as file_tags_table,
    )

    engine = _fresh_engine(tmp_path, "cascade.db")
    with engine.begin() as conn:
        conn.execute(text(_legacy_files_ddl_global_unique()))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, drive, folder_path,"
            " file_path, file_size) VALUES"
            " ('faaaaaaaaaaa', 'a.md', 'a', 'd', '', 'a.md', 1),"
            " ('fbbbbbbbbbbb', 'b.md', 'b', 'd', '', 'b.md', 1)"
        ))
    # Child tables carry ON DELETE CASCADE FKs to files.id.
    for table in (
        Tag.__table__,
        file_tags_table,
        Comment.__table__,
        FileRelation.__table__,
        FileExif.__table__,
    ):
        table.create(bind=engine)
    ts = "2026-01-01 00:00:00"
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO tags (id, name, drive, created_at)"
            f" VALUES (1, 't', 'd', '{ts}')"
        ))
        conn.execute(text(
            "INSERT INTO file_tags (file_id, tag_id)"
            " VALUES ('faaaaaaaaaaa', 1)"
        ))
        conn.execute(text(
            "INSERT INTO comments (id, file_id, body, created_at, updated_at)"
            f" VALUES ('caaaaaaaaaaa', 'faaaaaaaaaaa', 'hello', '{ts}', '{ts}')"
        ))
        conn.execute(text(
            "INSERT INTO file_relations (file_id_a, file_id_b, kind, created_at)"
            f" VALUES ('faaaaaaaaaaa', 'fbbbbbbbbbbb', 'related', '{ts}')"
        ))
        conn.execute(text(
            "INSERT INTO file_exif (file_id, make, extracted_at) VALUES"
            f" ('faaaaaaaaaaa', 'Canon', '{ts}')"
        ))

    _migrate(engine)

    assert _has_composite_unique(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM files")).scalar() == 2
        assert conn.execute(
            text("SELECT COUNT(*) FROM file_tags")
        ).scalar() == 1
        assert conn.execute(
            text("SELECT COUNT(*) FROM comments")
        ).scalar() == 1
        assert conn.execute(
            text("SELECT COUNT(*) FROM file_relations")
        ).scalar() == 1
        assert conn.execute(
            text("SELECT COUNT(*) FROM file_exif")
        ).scalar() == 1
        # Referential integrity must hold after the swap.
        orphans = conn.execute(
            text("PRAGMA foreign_key_check")
        ).fetchall()
    assert orphans == []


# --- resolve_db_path_conflict must be drive-scoped -------------------------


def test_resolve_db_path_conflict_ignores_other_drive(tmp_path):
    """A ghost record in drive A at ``x.md`` must not be disturbed when
    freeing the slot for drive B's ``x.md`` — with the global UNIQUE gone,
    an unscoped query would wrongly retire/delete the wrong drive's row."""
    from datetime import UTC, datetime

    from app.services.fileops import resolve_db_path_conflict

    engine = _fresh_engine(tmp_path, "conflict.db")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Drive A: a Missing ghost at "x.md".
    ghost = File(filename="x.md", title="x", drive="A", folder_path="",
                 file_path="x.md", file_size=1,
                 missing_since=datetime.now(UTC))
    db.add(ghost)
    db.commit()
    ghost_id = ghost.id

    # Free the slot for drive B — must leave drive A's ghost untouched.
    resolve_db_path_conflict(db, "x.md", "B")
    db.commit()

    refreshed = db.query(File).filter(File.id == ghost_id).one()
    assert refreshed.file_path == "x.md"          # not retired
    assert refreshed.missing_since is not None      # still the same ghost
    db.close()


def test_resolve_db_path_conflict_still_handles_same_drive_ghost(tmp_path):
    """Within the same drive a trashed ghost is still purged so the new
    write can take the slot."""
    from datetime import UTC, datetime

    from app.services.fileops import resolve_db_path_conflict

    engine = _fresh_engine(tmp_path, "samedrive.db")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    trashed = File(filename="y.md", title="y", drive="A", folder_path="",
                   file_path="y.md", file_size=1,
                   deleted_at=datetime.now(UTC))
    db.add(trashed)
    db.commit()
    trashed_id = trashed.id

    resolve_db_path_conflict(db, "y.md", "A")
    db.commit()

    assert db.query(File).filter(File.id == trashed_id).first() is None
    db.close()
