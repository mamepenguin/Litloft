"""Migration test: ``md_id VARCHAR(32)`` column added to ``files`` table.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md §3.6 / §4 Phase A.

Pattern mirrors the existing ``file_hash`` migration (database.py:327)
and ``missing_since`` migration (database.py:342) — column existence
check + ``ALTER TABLE ... ADD COLUMN`` + create index, all idempotent.

The matching index is ``idx_files_drive_md_id`` on ``(drive, md_id)``
(non-unique — collisions are resolved at write time with the 17-digit
suffix, so we never need a UNIQUE constraint here).
"""
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, _migrate


def _enable_fk(engine):
    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def test_md_id_column_added_to_files(tmp_path):
    """Running ``_migrate`` on a DB whose ``files`` table predates the
    md_id migration adds the column without losing existing rows."""
    db_path = tmp_path / "legacy.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)

    # Stand up the legacy ``files`` schema without ``md_id``.
    with engine.begin() as conn:
        conn.execute(text("""
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
                file_hash VARCHAR(64)
            )
        """))
        conn.execute(text("""
            INSERT INTO files (id, filename, title, file_path, file_size)
            VALUES ('aaaaaaaaaaaa', 'a.md', 'a.md', 'a.md', 1)
        """))

    # Sanity: legacy schema lacks md_id.
    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("files")}
    assert "md_id" not in cols

    _migrate(engine)

    # After migration the column exists, existing row preserved with NULL.
    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("files")}
    assert "md_id" in cols
    with engine.connect() as conn:
        rows = list(conn.execute(text("SELECT id, md_id FROM files")))
    assert len(rows) == 1
    assert rows[0][0] == "aaaaaaaaaaaa"
    assert rows[0][1] is None


def test_md_id_migration_is_idempotent(tmp_path):
    """Running ``init_db``-style migration twice doesn't error."""
    db_path = tmp_path / "idem.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    # Fresh schema (Base.metadata) already has md_id baked in.
    Base.metadata.create_all(bind=engine)

    # First call: nothing to do because the column is already there.
    _migrate(engine)
    # Second call: must not raise (catches the "column already exists"
    # branch on a freshly-created table too).
    _migrate(engine)

    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("files")}
    assert "md_id" in cols


def test_md_id_index_created(tmp_path):
    """The ``idx_files_drive_md_id`` index exists on (drive, md_id)."""
    db_path = tmp_path / "idx.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)

    # Same legacy-schema seed as above.
    with engine.begin() as conn:
        conn.execute(text("""
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
                file_hash VARCHAR(64)
            )
        """))

    _migrate(engine)

    inspector = inspect(engine)
    index_names = {i["name"] for i in inspector.get_indexes("files")}
    assert "idx_files_drive_md_id" in index_names

    # The index must cover (drive, md_id) — order matters for SQLite
    # equality + prefix scans.
    drive_idx = next(
        i for i in inspector.get_indexes("files")
        if i["name"] == "idx_files_drive_md_id"
    )
    assert drive_idx["column_names"] == ["drive", "md_id"]


def test_fresh_db_has_md_id_column(tmp_path):
    """A brand-new DB initialised via ``Base.metadata.create_all`` (i.e.
    the path taken on a clean install) already has the column."""
    db_path = tmp_path / "fresh.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("files")}
    assert "md_id" in cols


def test_existing_rows_have_null_md_id_after_migration(tmp_path):
    """Existing files rows pre-migration must end up with ``md_id = NULL``
    so the scanner / PUT path can backfill lazily."""
    db_path = tmp_path / "rows.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    with engine.begin() as conn:
        conn.execute(text("""
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
                file_hash VARCHAR(64)
            )
        """))
        for fid in ("aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"):
            conn.execute(text(
                "INSERT INTO files (id, filename, title, file_path, file_size)"
                f" VALUES ('{fid}', '{fid}.md', '{fid}.md', '{fid}.md', 1)"
            ))

    _migrate(engine)

    with engine.connect() as conn:
        rows = list(conn.execute(text("SELECT id, md_id FROM files")))
    assert len(rows) == 3
    assert all(r[1] is None for r in rows)
