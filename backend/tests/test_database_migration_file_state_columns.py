"""Upgrading a database that predates the three file-state columns.

``design-decisions.md`` §File state puts Active / Missing / Trash in
``deleted_at`` and ``missing_since``; ``file_hash`` is what move detection
matches on. ``active_file_filter()`` names the first two directly, so a
database that comes out of startup without them answers no file query at all,
and ``_migrate``'s own hash-format reset reads ``file_hash`` before the end.

**What these tests hold is the end state of ``_migrate``, not any one phase of
it.** More than one phase can supply the same column, so naming a phase in an
assertion would claim something the assertion cannot tell apart. Each one below
is about what an upgraded database has to look like to be usable.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

# ``files`` as it stood before soft delete, move detection and missing-file
# tracking: no ``deleted_at``, ``missing_since`` or ``file_hash``. The
# single-column UNIQUE on ``file_path`` is period-accurate, and means the
# composite rebuild runs here too — this is the ordering the columns have to
# survive, not an isolated ALTER.
PRE_STATE_FILES_DDL = (
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

STATE_COLUMNS = ("deleted_at", "missing_since", "file_hash")

# ``_migrate`` writes a sentinel into DATA_DIR; ``private_data_dir``
# in ``conftest.py`` says why that must not be the shared one.
pytestmark = pytest.mark.usefixtures("private_data_dir")


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns(table)}


def _indexes(engine, table: str) -> dict[str, list[str]]:
    return {
        i["name"]: list(i["column_names"])
        for i in inspect(engine).get_indexes(table)
    }


@pytest.fixture()
def pre_state_db(tmp_path: Path):
    """A database from before the three columns existed, holding one row."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'pre_state.db'}",
        connect_args={"check_same_thread": False},
    )
    with engine.begin() as conn:
        conn.execute(text(PRE_STATE_FILES_DDL))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, drive, folder_path,"
            " file_path, file_size) "
            "VALUES ('aaaaaaaaaaaa', 'a.mp4', 'A', 'd', '', 'a.mp4', 7)"
        ))
    assert _columns(engine, "files").isdisjoint(STATE_COLUMNS)
    yield engine
    engine.dispose()


@pytest.mark.parametrize("column", STATE_COLUMNS)
def test_the_column_is_added(pre_state_db, column):
    from app.database import _migrate

    _migrate(pre_state_db)

    assert column in _columns(pre_state_db, "files")


@pytest.mark.parametrize("column", STATE_COLUMNS)
def test_the_column_starts_null_on_every_existing_row(pre_state_db, column):
    """An existing file comes through Active, and with no hash claimed.

    A non-NULL ``deleted_at`` or ``missing_since`` would put the whole library
    into Trash or Missing on the first boot after the upgrade; a non-NULL
    ``file_hash`` would be a hash nothing computed, which move detection would
    then match another file against.
    """
    from app.database import _migrate

    _migrate(pre_state_db)

    with pre_state_db.connect() as conn:
        values = conn.execute(text(f"SELECT {column} FROM files")).scalars().all()
    assert values == [None]


@pytest.mark.parametrize("column", STATE_COLUMNS)
def test_the_column_is_indexed(pre_state_db, column):
    """Without the index the Trash, Missing and duplicate views full-scan
    ``files`` on an upgraded database while a fresh one does not — invisible
    until the library is large.

    The columns are asserted, not only the name: an index called
    ``idx_files_deleted_at`` that covers ``title`` satisfies every query plan
    the docstring above is about exactly as badly as no index at all.
    """
    from app.database import _migrate

    _migrate(pre_state_db)

    assert _indexes(pre_state_db, "files")[f"idx_files_{column}"] == [column]


def test_the_row_survives(pre_state_db):
    from app.database import _migrate

    _migrate(pre_state_db)

    with pre_state_db.connect() as conn:
        rows = conn.execute(text("SELECT id, file_path, file_size FROM files")).all()
    assert rows == [("aaaaaaaaaaaa", "a.mp4", 7)]


def _snapshot(engine):
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM files")).all()
    return _columns(engine, "files"), _indexes(engine, "files"), rows


def test_running_twice_changes_nothing(pre_state_db):
    """Startup runs ``_migrate`` every boot, so the second one has to be inert."""
    from app.database import _migrate

    _migrate(pre_state_db)
    first = _snapshot(pre_state_db)

    _migrate(pre_state_db)

    assert _snapshot(pre_state_db) == first
