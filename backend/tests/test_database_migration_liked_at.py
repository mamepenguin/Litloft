"""Tests for the ``likes`` → ``liked_at`` column migration.

Spec: docs/superpowers/specs/2026-09-01-favorite-like-separation.md

``files.likes`` was an INTEGER counter that ``POST /files/{id}/like``
incremented and ``/dislike`` decremented. It is replaced by ``liked_at``,
a nullable timestamp that is both the "was this liked" flag and the sort
key for the Liked view.

The migration must:

1. Add ``liked_at`` and drop ``likes``.
2. Carry ``likes > 0`` to a set timestamp and everything else to NULL —
   including **negative** counters, which the old ``/dislike`` endpoint
   could produce because it had no lower bound.
3. Be idempotent.
4. Survive running against a database old enough to still trigger the
   composite ``UNIQUE(drive, file_path)`` rebuild. That rebuild copies
   through a hardcoded column list which does not mention ``liked_at``,
   so a conversion placed before it would be silently undone.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def _make_engine(tmp_path: Path, name: str = "migration.db"):
    return create_engine(
        f"sqlite:///{tmp_path / name}",
        connect_args={"check_same_thread": False},
    )


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns(table)}


def _indexes(engine, table: str) -> set[str]:
    return {i["name"] for i in inspect(engine).get_indexes(table)}


# A ``files`` table carrying the counter. No composite UNIQUE constraint,
# so ``_migrate`` also runs the drive-scoped file_path rebuild against it —
# which is exactly the ordering this migration has to survive.
LEGACY_FILES_DDL = (
    "CREATE TABLE files ("
    "id VARCHAR(12) PRIMARY KEY,"
    "filename VARCHAR NOT NULL,"
    "title VARCHAR NOT NULL,"
    "description TEXT DEFAULT '',"
    "drive VARCHAR NOT NULL DEFAULT '',"
    "folder_path VARCHAR NOT NULL DEFAULT '',"
    "file_path VARCHAR NOT NULL,"
    "file_size INTEGER NOT NULL,"
    "file_type VARCHAR NOT NULL DEFAULT 'other',"
    "mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',"
    "thumbnail_path VARCHAR,"
    "duration REAL,"
    "likes INTEGER DEFAULT 0,"
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


def _make_legacy_db(tmp_path: Path, name: str = "migration.db"):
    from app.database import Base

    engine = _make_engine(tmp_path, name)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE files"))
        conn.execute(text(LEGACY_FILES_DDL))
    return engine


UPDATED = "2026-07-04T11:22:33"


def _insert(conn, file_id: str, likes: int) -> None:
    conn.execute(
        text(
            "INSERT INTO files "
            "(id, filename, title, drive, folder_path, file_path, file_size,"
            " likes, created_at, updated_at) "
            "VALUES (:id, :fn, :fn, 'd', '', :fn, 1, :likes,"
            " '2026-01-01T00:00:00', :updated)"
        ),
        {"id": file_id, "fn": f"{file_id}.mp4", "likes": likes,
         "updated": UPDATED},
    )


class TestLikedAtMigration:
    def test_fresh_db_has_liked_at_and_no_likes(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)

        cols = _columns(engine, "files")
        assert "liked_at" in cols
        assert "likes" not in cols

    def test_legacy_db_gains_liked_at_and_loses_likes(self, tmp_path):
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        assert "likes" in _columns(engine, "files")
        assert "liked_at" not in _columns(engine, "files")

        _migrate(engine)

        cols = _columns(engine, "files")
        assert "liked_at" in cols
        assert "likes" not in cols

    def test_counter_values_map_to_a_timestamp_or_null(self, tmp_path):
        """A liked row keeps ``updated_at``; everything else is NULL.

        The pre-migration counter recorded no timestamp, so ``updated_at``
        is an approximation, not a recovered like time. Negative counters
        were reachable: ``/dislike`` decremented without a lower bound.
        """
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        with engine.begin() as conn:
            _insert(conn, "aaaaaaaaaaaa", likes=0)
            _insert(conn, "bbbbbbbbbbbb", likes=1)
            _insert(conn, "cccccccccccc", likes=5)
            _insert(conn, "dddddddddddd", likes=-2)

        _migrate(engine)

        with engine.connect() as conn:
            rows = dict(conn.execute(text(
                "SELECT id, liked_at FROM files"
            )).all())

        assert rows["aaaaaaaaaaaa"] is None
        assert rows["dddddddddddd"] is None
        assert rows["bbbbbbbbbbbb"] is not None
        assert rows["cccccccccccc"] is not None
        assert str(rows["bbbbbbbbbbbb"]).startswith("2026-07-04")

    def test_survives_the_composite_unique_rebuild(self, tmp_path):
        """The ordering guard.

        ``_migrate`` rebuilds ``files`` to add UNIQUE(drive, file_path)
        when the constraint is absent, copying through a hardcoded column
        list that has no ``liked_at``. A conversion running before that
        rebuild would have its column dropped on the way through, losing
        every like without an error.
        """
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        with engine.begin() as conn:
            _insert(conn, "eeeeeeeeeeee", likes=3)

        _migrate(engine)

        uniques = inspect(engine).get_unique_constraints("files")
        assert any(
            sorted(u["column_names"]) == ["drive", "file_path"]
            for u in uniques
        ), "the rebuild this test exists to run did not run"

        with engine.connect() as conn:
            liked_at = conn.execute(text(
                "SELECT liked_at FROM files WHERE id = 'eeeeeeeeeeee'"
            )).scalar()
        assert liked_at is not None

    def test_is_idempotent(self, tmp_path):
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        with engine.begin() as conn:
            _insert(conn, "ffffffffffff", likes=2)

        _migrate(engine)
        with engine.connect() as conn:
            first = conn.execute(text(
                "SELECT liked_at FROM files WHERE id = 'ffffffffffff'"
            )).scalar()

        _migrate(engine)  # second run must be a no-op, not an error.

        with engine.connect() as conn:
            second = conn.execute(text(
                "SELECT liked_at FROM files WHERE id = 'ffffffffffff'"
            )).scalar()
        assert first == second
        assert "likes" not in _columns(engine, "files")

    def test_upgraded_db_gets_the_index(self, tmp_path):
        """``create_all`` does not add indexes to an existing table.

        Without an explicit CREATE INDEX, an upgraded database full-scans
        ``files`` for the Liked view while a fresh one does not.
        """
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        _migrate(engine)

        assert "idx_files_liked_at" in _indexes(engine, "files")
