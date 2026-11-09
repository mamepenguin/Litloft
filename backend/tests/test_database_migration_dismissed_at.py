"""Acceptance tests for the ``watch_history.dismissed_at`` migration.

SPEC-CORE-070 I8 of docs/specs/home-continue-desk.md.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.usefixtures("private_data_dir")


def _make_engine(tmp_path: Path, name: str = "migration.db"):
    return create_engine(
        f"sqlite:///{tmp_path / name}",
        connect_args={"check_same_thread": False},
    )


def _columns(engine) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns("watch_history")}


def _make_db_without_the_column(tmp_path: Path):
    from app.database import Base

    engine = _make_engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    if "dismissed_at" in _columns(engine):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE watch_history DROP COLUMN dismissed_at"))
    return engine


def _insert_rows(engine) -> None:
    with engine.begin() as conn:
        for i in range(3):
            conn.execute(
                text(
                    "INSERT INTO files (id, filename, title, description, drive, folder_path,"
                    " file_path, file_size, file_type, mime_type, created_at, updated_at)"
                    " VALUES (:id, :fn, :fn, '', 'd', '', :fn, 1, 'video', 'video/mp4',"
                    " '2026-01-01T00:00:00', '2026-01-01T00:00:00')"
                ),
                {"id": f"file{i:08d}", "fn": f"v{i}.mp4"},
            )
            conn.execute(
                text(
                    "INSERT INTO watch_history (viewer_id, file_id, playback_position,"
                    " duration, last_played_at) VALUES (:v, :f, :p, 100, :at)"
                ),
                {"v": f"viewer{i}", "f": f"file{i:08d}", "p": 10 * (i + 1),
                 "at": f"2026-11-0{i + 1}T12:00:00"},
            )


def _rows(engine):
    with engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT viewer_id, file_id, playback_position, duration, last_played_at,"
                " dismissed_at FROM watch_history ORDER BY viewer_id"
            )
        ).all()


class TestDismissedAtMigration:
    """SPEC-CORE-070 I8."""

    def test_spec_core_070_an_old_database_gains_the_column_as_null_and_keeps_every_row(
        self, tmp_path
    ):
        from app.database import _migrate

        engine = _make_db_without_the_column(tmp_path)
        _insert_rows(engine)
        assert "dismissed_at" not in _columns(engine)

        _migrate(engine)

        assert "dismissed_at" in _columns(engine)
        rows = _rows(engine)
        assert len(rows) == 3
        assert [(r.viewer_id, r.file_id, r.playback_position) for r in rows] == [
            ("viewer0", "file00000000", 10),
            ("viewer1", "file00000001", 20),
            ("viewer2", "file00000002", 30),
        ]
        assert all(r.dismissed_at is None for r in rows)

    def test_spec_core_070_a_second_startup_is_a_no_op(self, tmp_path):
        from app.database import _migrate

        engine = _make_db_without_the_column(tmp_path)
        _insert_rows(engine)
        _migrate(engine)
        first = _rows(engine)

        _migrate(engine)

        assert _rows(engine) == first

    def test_spec_core_070_a_fresh_database_has_the_column_and_migrates_cleanly(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)

        _migrate(engine)

        assert "dismissed_at" in _columns(engine)
