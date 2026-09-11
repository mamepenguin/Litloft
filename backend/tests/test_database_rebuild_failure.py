"""What a failed ``files`` rebuild leaves behind.

``_migrate``'s drive-scoped ``UNIQUE(drive, file_path)`` rebuild is the one
migration that turns foreign-key enforcement off on a raw DBAPI connection:
with it on, ``DROP TABLE files`` cascades into ``file_tags`` /
``file_relations`` / ``file_exif`` / ``comments`` and wipes them. That leaves
the connection in a state no other code expects, so the failure path has to
discard it rather than return it to the pool. The engine's ``connect``
listener is what puts ``PRAGMA foreign_keys=ON`` on a connection, and it runs
once per *new* DBAPI connection — a pooled one that is handed back out never
passes through it again.

The trigger used here is a name collision on ``files_new``. What is under test
is the handler, which every failure inside the rebuild reaches the same way.

The rebuild drives a raw DBAPI cursor rather than a SQLAlchemy connection, so
what escapes it is the driver's own ``sqlite3.OperationalError`` — unwrapped,
because nothing in the path does the wrapping.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, inspect, text

# ``files`` as it was before the composite constraint: ``file_path`` carries a
# single-column UNIQUE, which is what makes ``_migrate`` rebuild the table.
PRE_COMPOSITE_FILES_DDL = (
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
    "is_favorite BOOLEAN DEFAULT 0,"
    "created_at DATETIME,"
    "updated_at DATETIME,"
    "deleted_at DATETIME,"
    "missing_since DATETIME,"
    "file_hash VARCHAR(64),"
    "md_id VARCHAR(32),"
    "md_aliases TEXT"
    ")"
)


def _make_engine(tmp_path: Path):
    """An engine carrying the production ``foreign_keys=ON`` connect listener.

    ``app.database.engine`` registers one; a plain ``create_engine`` does not,
    and SQLite's own default is OFF. Without the listener both a reused and a
    fresh connection read 0 and the assertion below could not tell them apart.
    """
    engine = create_engine(
        f"sqlite:///{tmp_path / 'rebuild.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, connection_record):  # pragma: no cover - listener
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def _foreign_keys_setting(engine) -> int:
    with engine.connect() as conn:
        return conn.exec_driver_sql("PRAGMA foreign_keys").scalar()


@pytest.fixture()
def stalled_rebuild(tmp_path):
    """A DB whose rebuild is guaranteed to fail part-way through.

    ``files`` has the old single-column UNIQUE, so the rebuild runs; a table
    already occupying the name ``files_new`` makes its first statement raise.
    """
    engine = _make_engine(tmp_path)
    with engine.begin() as conn:
        conn.execute(text(PRE_COMPOSITE_FILES_DDL))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, drive, folder_path,"
            " file_path, file_size) "
            "VALUES ('aaaaaaaaaaaa', 'a.mp4', 'A', 'd', '', 'a.mp4', 1)"
        ))
        conn.execute(text("CREATE TABLE files_new (id VARCHAR(12) PRIMARY KEY)"))
    yield engine
    engine.dispose()


def test_a_failed_rebuild_raises(stalled_rebuild):
    """Startup must stop rather than carry on unconverted.

    Swallowing this leaves ``files`` with the single-column UNIQUE on
    ``file_path`` — the global uniqueness that made two drives unable to each
    hold a root ``README.md`` — while the process boots as if the migration had
    happened, and the later phases run against a schema that is not the one
    they were written for.
    """
    from app.database import _migrate

    with pytest.raises(sqlite3.OperationalError):
        _migrate(stalled_rebuild)


def test_a_failed_rebuild_leaves_the_rows_where_they_were(stalled_rebuild):
    from app.database import _migrate

    with pytest.raises(sqlite3.OperationalError):
        _migrate(stalled_rebuild)

    with stalled_rebuild.connect() as conn:
        rows = conn.execute(text("SELECT id, file_path FROM files")).all()
    assert rows == [("aaaaaaaaaaaa", "a.mp4")]


def test_a_failed_rebuild_does_not_return_an_fk_disabled_connection(stalled_rebuild):
    """The connection the rebuild poisoned must not come back out of the pool.

    If it does, every later checkout on it runs with foreign keys off, and the
    ``ON DELETE CASCADE`` that ``file_tags`` / ``file_relations`` / ``comments``
    rely on silently stops firing — a trashed file leaves its rows behind, and
    nothing raises.
    """
    from app.database import _migrate

    assert _foreign_keys_setting(stalled_rebuild) == 1

    with pytest.raises(sqlite3.OperationalError):
        _migrate(stalled_rebuild)

    assert _foreign_keys_setting(stalled_rebuild) == 1


def test_the_pre_existing_table_is_not_silently_adopted(stalled_rebuild):
    """``files_new`` is left alone rather than renamed over ``files``.

    The rebuild's own ``files_new`` is created inside the transaction it
    aborted, so anything still carrying that name after the failure is the
    table that was already there — and it holds none of the data.
    """
    from app.database import _migrate

    with pytest.raises(sqlite3.OperationalError):
        _migrate(stalled_rebuild)

    assert "files_new" in inspect(stalled_rebuild).get_table_names()
    with stalled_rebuild.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM files_new")).scalar() == 0
