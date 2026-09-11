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

The trigger used here is a name collision on ``files_new``, which fails the
rebuild's first statement — before its ``COMMIT``. That is what makes "the rows
are where they were" and "the schema did not change" true below.

**The rebuild has a second failure and it is not this one.** Its
``foreign_key_check`` guard raises *after* the ``COMMIT``, so the conversion is
already durable when the exception escapes: the rows have moved, the new
constraint is on disk, and the handler's rollback has nothing left to undo.
``TestOrphanGuard`` below covers that path separately and asserts what it
actually leaves, rather than folding it into the claims made about this one.

The rebuild drives a raw DBAPI cursor rather than a SQLAlchemy connection, so
whatever a statement raises comes out unwrapped — nothing in the path does the
wrapping. **Which** exception that is depends on the statement: the collision
below raises ``sqlite3.OperationalError``; an ``INSERT`` that finds two rows
sharing ``(drive, file_path)`` raises ``sqlite3.IntegrityError``; the guard
raises a ``RuntimeError`` of its own. Each test names the one it expects rather
than the file claiming a single type for all of them.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, inspect, text

# ``_migrate`` writes a sentinel into DATA_DIR; ``private_data_dir``
# in ``conftest.py`` says why that must not be the shared one.
pytestmark = pytest.mark.usefixtures("private_data_dir")

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
    def _set_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def _foreign_keys_setting(engine) -> int:
    with engine.connect() as conn:
        return conn.exec_driver_sql("PRAGMA foreign_keys").scalar()


@pytest.fixture()
def stalled_rebuild(tmp_path):
    """A DB whose rebuild fails on its first statement.

    ``files`` has the old single-column UNIQUE, so the rebuild runs; a table
    already occupying the name ``files_new`` makes its ``CREATE TABLE`` raise
    before anything else in the transaction has happened.
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
    hold a root ``README.md`` — while the process boots as if the migration
    had happened.
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


# --- the other failure inside the rebuild ---------------------------------


@pytest.fixture()
def orphaned_child_row(tmp_path):
    """A pre-composite database carrying one ``file_tags`` row with no file.

    An orphan is reachable without any bug in this code: SQLite's own default
    for ``foreign_keys`` is OFF, so a write made through a connection that did
    not pass the engine's listener — a manual ``sqlite3`` session, a tool that
    opens ``data/data.db`` directly — leaves one behind. It is seeded the same
    way here.
    """
    engine = _make_engine(tmp_path)
    with engine.begin() as conn:
        conn.execute(text(PRE_COMPOSITE_FILES_DDL))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, drive, folder_path,"
            " file_path, file_size) "
            "VALUES ('aaaaaaaaaaaa', 'a.mp4', 'A', 'd', '', 'a.mp4', 1)"
        ))
        conn.execute(text(
            "CREATE TABLE file_tags ("
            "file_id VARCHAR(12) REFERENCES files(id) ON DELETE CASCADE,"
            "tag_id INTEGER, PRIMARY KEY (file_id, tag_id))"
        ))

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.execute("INSERT INTO file_tags VALUES ('gone00000000', 1)")
        raw.commit()
    finally:
        raw.close()

    yield engine
    engine.dispose()


def _orphans(engine) -> list:
    with engine.connect() as conn:
        return conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall()


class TestOrphanGuard:
    """``foreign_key_check`` after the rebuild, and what it does and does not buy.

    What makes the rebuild safe to run with foreign keys off is that ids are
    preserved, so every child row still resolves against the renamed table.
    The guard checks that, rather than establishing it — and the third test
    below is the limit of what the check is worth: it stops the boot it runs
    on and nothing re-runs it.
    """

    def test_an_orphan_stops_the_migration(self, orphaned_child_row):
        from app.database import _migrate

        with pytest.raises(RuntimeError) as exc:
            _migrate(orphaned_child_row)

        assert "foreign_key_check" in str(exc.value)

    def test_the_conversion_is_already_durable_when_it_raises(
        self, orphaned_child_row
    ):
        """The claims the collision path makes do not hold here.

        This check runs after the rebuild's ``COMMIT``, so the raise cannot
        undo it: the new constraint is on disk and the rows have moved. The
        file's opening docstring says so; this is the assertion behind it.
        """
        from app.database import _migrate

        with pytest.raises(RuntimeError):
            _migrate(orphaned_child_row)

        constraints = inspect(orphaned_child_row).get_unique_constraints("files")
        assert any(
            sorted(c["column_names"]) == ["drive", "file_path"]
            for c in constraints
        )

    def test_a_restart_walks_past_the_guard(self, orphaned_child_row):
        """Pinned because it is the behaviour, not because it is wanted.

        The rebuild is gated on the composite constraint being absent, and the
        first boot committed it before raising. So the second boot skips the
        rebuild, never reaches the check, and starts normally with the orphan
        still on disk — and restarting is the first thing an operator does when
        startup fails. Changing this is a decision about the migration, not
        about the test; if it is taken, this test is what has to be rewritten,
        which is the point of writing it down.
        """
        from app.database import _migrate

        with pytest.raises(RuntimeError):
            _migrate(orphaned_child_row)
        assert _orphans(orphaned_child_row) != []

        _migrate(orphaned_child_row)  # must not raise

        assert _orphans(orphaned_child_row) != []
