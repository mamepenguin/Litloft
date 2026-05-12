"""Migration test: legacy ``playlists`` / ``playlist_items`` tables are
copied into the new ``collections`` / ``collection_items`` tables with
NULL ``description``, then the legacy tables are dropped. Verifies the
Phase 1 spec (2026-05-12-playlist-to-collection) backend migration.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, _migrate


def _enable_fk(engine):
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _seed_legacy_tables(conn) -> None:
    """Recreate the legacy ``playlists`` / ``playlist_items`` schema."""
    conn.execute(text("""
        CREATE TABLE playlists (
            id VARCHAR(12) PRIMARY KEY,
            drive VARCHAR NOT NULL,
            name VARCHAR(100) NOT NULL,
            created_at DATETIME,
            updated_at DATETIME,
            CONSTRAINT uq_playlists_drive_name UNIQUE (drive, name)
        )
    """))
    conn.execute(text("""
        CREATE TABLE playlist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id VARCHAR(12) NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            file_id VARCHAR(12) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME,
            CONSTRAINT uq_playlist_items_playlist_file UNIQUE (playlist_id, file_id)
        )
    """))


def test_playlist_to_collection_migration_copies_data(tmp_path):
    db_path = tmp_path / "legacy.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)

    # Create only the files table first so the playlist_items FK
    # resolves, then seed the legacy playlist tables alongside it.
    Base.metadata.tables["files"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["tags"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["file_tags"].create(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        # Seed a file so the FK on playlist_items resolves.
        conn.execute(text("""
            INSERT INTO files (id, filename, title, description, drive, folder_path,
                file_path, file_size, file_type, mime_type, created_at, updated_at)
            VALUES ('file000000aa', 'a.mp3', 'a', '', 'test-drive', '',
                'a.mp3', 100, 'audio', 'audio/mpeg', '2026-01-01', '2026-01-01')
        """))
        conn.execute(text("""
            INSERT INTO files (id, filename, title, description, drive, folder_path,
                file_path, file_size, file_type, mime_type, created_at, updated_at)
            VALUES ('file000000bb', 'b.mp3', 'b', '', 'test-drive', '',
                'b.mp3', 100, 'audio', 'audio/mpeg', '2026-01-01', '2026-01-01')
        """))
        _seed_legacy_tables(conn)
        conn.execute(text("""
            INSERT INTO playlists (id, drive, name, created_at, updated_at)
            VALUES ('pl0000000001', 'test-drive', 'Mix A', '2026-01-01', '2026-01-02')
        """))
        conn.execute(text("""
            INSERT INTO playlists (id, drive, name, created_at, updated_at)
            VALUES ('pl0000000002', 'test-drive', 'Mix B', '2026-01-03', '2026-01-04')
        """))
        conn.execute(text("""
            INSERT INTO playlist_items (id, playlist_id, file_id, position, created_at)
            VALUES (1, 'pl0000000001', 'file000000aa', 0, '2026-01-01')
        """))
        conn.execute(text("""
            INSERT INTO playlist_items (id, playlist_id, file_id, position, created_at)
            VALUES (2, 'pl0000000001', 'file000000bb', 1, '2026-01-01')
        """))

    # Run the full init_db sequence: create_all creates the new tables,
    # _migrate copies legacy data and drops the legacy tables.
    Base.metadata.create_all(bind=engine)
    _migrate(engine)

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert "collections" in tables
    assert "collection_items" in tables
    assert "playlists" not in tables
    assert "playlist_items" not in tables

    TestSession = sessionmaker(bind=engine)
    with TestSession() as session:
        rows = session.execute(text(
            "SELECT id, drive, name, description FROM collections ORDER BY id"
        )).all()
        assert rows == [
            ("pl0000000001", "test-drive", "Mix A", None),
            ("pl0000000002", "test-drive", "Mix B", None),
        ]
        item_rows = session.execute(text(
            "SELECT id, collection_id, file_id, position "
            "FROM collection_items ORDER BY id"
        )).all()
        assert item_rows == [
            (1, "pl0000000001", "file000000aa", 0),
            (2, "pl0000000001", "file000000bb", 1),
        ]
    engine.dispose()


def test_fresh_install_creates_collections_tables(tmp_path):
    """Idempotency: on a fresh database with no legacy tables, the new
    tables must still be created and the migration block must be a no-op.
    """
    db_path = tmp_path / "fresh.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    Base.metadata.create_all(bind=engine)
    _migrate(engine)

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert "collections" in tables
    assert "collection_items" in tables
    assert "playlists" not in tables
    assert "playlist_items" not in tables
    engine.dispose()
