"""Startup deletes collection items whose file and collection drives differ.

SPEC-CORE-034 I3.
"""

from __future__ import annotations

import logging

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.database import Base, _backfill_mangled_titles, _migrate
from app.models import Collection, CollectionItem, File

pytestmark = pytest.mark.usefixtures("private_data_dir")

LEGACY_FILES_DDL = (
    "CREATE TABLE files ("
    "id VARCHAR(12) PRIMARY KEY,"
    "filename VARCHAR NOT NULL,"
    "title VARCHAR NOT NULL,"
    "description TEXT DEFAULT '',"
    "drive VARCHAR NOT NULL DEFAULT '',"
    "folder_path VARCHAR NOT NULL DEFAULT '',"
    "file_path VARCHAR NOT NULL UNIQUE,"
    "file_size INTEGER NOT NULL,"
    "file_type VARCHAR NOT NULL DEFAULT 'other',"
    "mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',"
    "thumbnail_path VARCHAR,"
    "duration REAL,"
    "likes INTEGER DEFAULT 0,"
    "is_favorite BOOLEAN DEFAULT 0,"
    "created_at DATETIME,"
    "updated_at DATETIME"
    ")"
)

MINIMAL_COLLECTIONS_DDL = (
    "CREATE TABLE collections ("
    "id VARCHAR(12) PRIMARY KEY,"
    "drive VARCHAR NOT NULL,"
    "name VARCHAR NOT NULL,"
    "description TEXT,"
    "created_at DATETIME,"
    "updated_at DATETIME"
    ")"
)


def _engine(tmp_path):
    return create_engine(
        f"sqlite:///{tmp_path / 'startup.db'}",
        connect_args={"check_same_thread": False},
    )


def _file(session, file_id, drive):
    row = File(
        id=file_id,
        filename=f"{file_id}.mp4",
        title=file_id,
        drive=drive,
        folder_path="",
        file_path=f"{file_id}.mp4",
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
    )
    session.add(row)
    return row


def _collection(session, collection_id, drive):
    row = Collection(id=collection_id, drive=drive, name=collection_id)
    session.add(row)
    return row


def _item(session, item_id, collection_id, file_id, position):
    session.add(
        CollectionItem(
            id=item_id,
            collection_id=collection_id,
            file_id=file_id,
            position=position,
        )
    )


def _item_ids(engine):
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT id FROM collection_items ORDER BY id")
        ).scalars().all()


def _cleanup_records(caplog):
    return [
        record
        for record in caplog.records
        if "collection item" in record.getMessage().lower()
    ]


def _seed_mixed_drives(engine):
    with Session(engine) as session:
        file_a = _file(session, "file000000aa", "drive-a")
        file_b = _file(session, "file000000bb", "drive-b")
        collection_a = _collection(session, "col0000000a", "drive-a")
        collection_b = _collection(session, "col0000000b", "drive-b")
        _item(session, 1, collection_a.id, file_a.id, 0)
        _item(session, 2, collection_a.id, file_b.id, 1)
        _item(session, 3, collection_b.id, file_a.id, 2)
        session.commit()


# SPEC-CORE-034 I3
def test_deletes_exactly_the_rows_whose_file_and_collection_drives_differ(
    tmp_path, caplog
):
    engine = _engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        file_a = _file(session, "file000000aa", "drive-a")
        file_b = _file(session, "file000000bb", "drive-b")
        collection_a = _collection(session, "col0000000a", "drive-a")
        collection_b = _collection(session, "col0000000b", "drive-b")
        _item(session, 1, collection_a.id, file_a.id, 0)
        _item(session, 2, collection_a.id, file_b.id, 1)
        _item(session, 3, collection_b.id, file_a.id, 2)
        # A row with no file row and one with no collection row: the cleanup
        # joins on both, so neither is a cross-drive row it can see.
        _item(session, 4, collection_a.id, "danglingfile", 3)
        _item(session, 5, "danglingcol1", file_a.id, 4)
        session.commit()

    with caplog.at_level(logging.INFO, logger="app.database"):
        _migrate(engine)

    assert _item_ids(engine) == [1, 4, 5]
    messages = [record.getMessage() for record in _cleanup_records(caplog)]
    assert len(messages) == 1
    assert "Removed 2 collection item(s)" in messages[0]
    engine.dispose()


# SPEC-CORE-034 I3
def test_clean_data_deletes_and_logs_nothing(tmp_path, caplog):
    engine = _engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        row = _file(session, "file000000aa", "drive-a")
        collection = _collection(session, "col0000000a", "drive-a")
        _item(session, 1, collection.id, row.id, 0)
        session.commit()

    with caplog.at_level(logging.INFO, logger="app.database"):
        _migrate(engine)

    assert _item_ids(engine) == [1]
    assert _cleanup_records(caplog) == []
    engine.dispose()


# SPEC-CORE-034 I3
def test_a_second_start_removes_nothing_more_and_logs_nothing(tmp_path, caplog):
    engine = _engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    _seed_mixed_drives(engine)

    _migrate(engine)
    first = _item_ids(engine)
    caplog.clear()

    with caplog.at_level(logging.INFO, logger="app.database"):
        _migrate(engine)

    assert _item_ids(engine) == first
    assert _cleanup_records(caplog) == []
    engine.dispose()


# SPEC-CORE-034 I3
def test_the_cleanup_runs_after_the_playlists_copy_in_the_same_start(
    tmp_path, caplog
):
    engine = _engine(tmp_path)
    Base.metadata.tables["files"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["tags"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["file_tags"].create(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO files (id, filename, title, description, drive,"
            " folder_path, file_path, file_size, file_type, mime_type,"
            " created_at, updated_at) VALUES"
            " ('file000000aa', 'a.mp3', 'a', '', 'drive-a', '', 'a.mp3', 1,"
            " 'audio', 'audio/mpeg', '2026-01-01', '2026-01-01')"
        ))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, description, drive,"
            " folder_path, file_path, file_size, file_type, mime_type,"
            " created_at, updated_at) VALUES"
            " ('file000000bb', 'b.mp3', 'b', '', 'drive-b', '', 'b.mp3', 1,"
            " 'audio', 'audio/mpeg', '2026-01-01', '2026-01-01')"
        ))
        conn.execute(text(
            "CREATE TABLE playlists ("
            "id VARCHAR(12) PRIMARY KEY, drive VARCHAR NOT NULL,"
            "name VARCHAR(100) NOT NULL, created_at DATETIME,"
            "updated_at DATETIME)"
        ))
        conn.execute(text(
            "CREATE TABLE playlist_items ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "playlist_id VARCHAR(12) NOT NULL,"
            "file_id VARCHAR(12) NOT NULL,"
            "position INTEGER NOT NULL DEFAULT 0, created_at DATETIME)"
        ))
        conn.execute(text(
            "INSERT INTO playlists (id, drive, name, created_at, updated_at)"
            " VALUES ('pl0000000001', 'drive-a', 'Mix', '2026-01-01',"
            " '2026-01-02')"
        ))
        conn.execute(text(
            "INSERT INTO playlist_items (id, playlist_id, file_id, position,"
            " created_at) VALUES (1, 'pl0000000001', 'file000000aa', 0,"
            " '2026-01-01')"
        ))
        conn.execute(text(
            "INSERT INTO playlist_items (id, playlist_id, file_id, position,"
            " created_at) VALUES (2, 'pl0000000001', 'file000000bb', 1,"
            " '2026-01-01')"
        ))

    Base.metadata.create_all(bind=engine)
    with caplog.at_level(logging.INFO, logger="app.database"):
        _migrate(engine)

    assert _item_ids(engine) == [1]
    messages = [record.getMessage() for record in _cleanup_records(caplog)]
    assert len(messages) == 1
    assert "Removed 1 collection item(s)" in messages[0]
    engine.dispose()


# SPEC-CORE-034 I3
def test_a_database_error_logs_one_error_line_and_startup_carries_on(
    tmp_path, caplog
):
    engine = _engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    _seed_mixed_drives(engine)
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TRIGGER block_collection_item_delete"
            " BEFORE DELETE ON collection_items"
            " BEGIN SELECT RAISE(ABORT, 'injected'); END"
        ))

    with caplog.at_level(logging.ERROR, logger="app.database"):
        _migrate(engine)

    errors = [
        record
        for record in _cleanup_records(caplog)
        if record.levelno == logging.ERROR
    ]
    assert len(errors) == 1
    assert errors[0].getMessage().startswith("Collection item cleanup failed:")
    assert "injected" in errors[0].getMessage()
    # One statement aborts whole: no row was half-applied.
    assert _item_ids(engine) == [1, 2, 3]
    # The next startup step still runs.
    _backfill_mangled_titles(engine)
    engine.dispose()


def _files_only(conn):
    conn.execute(text(LEGACY_FILES_DDL))


def _collections_only(conn):
    conn.execute(text(MINIMAL_COLLECTIONS_DDL))


def _files_and_collections(conn):
    conn.execute(text(LEGACY_FILES_DDL))
    conn.execute(text(MINIMAL_COLLECTIONS_DDL))


# SPEC-CORE-034 I3
@pytest.mark.parametrize(
    "build",
    [_files_only, _collections_only, _files_and_collections],
    ids=["files-only", "collections-only", "files-and-collections"],
)
def test_the_cleanup_does_not_raise_on_a_hand_built_migration_schema(
    tmp_path, build
):
    engine = _engine(tmp_path)
    with engine.begin() as conn:
        build(conn)

    _migrate(engine)

    engine.dispose()
