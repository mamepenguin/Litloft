"""Tests for the ``image_width`` / ``image_height`` column migration.

Spec: docs/superpowers/specs/2026-09-06-ui-redesign-p4-viewers.md §1.

The migration in ``app/database.py:_migrate`` must add both columns when
absent and leave existing rows NULL — a width is a fact about the file on
disk, so it is the scanner's to fill, not the migration's to guess.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def _make_engine(tmp_path: Path):
    db_path = tmp_path / "migration.db"
    return create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns(table)}


def _make_legacy_db(tmp_path: Path):
    """A ``files`` table as it stood before the dimension columns."""
    from app.database import Base

    engine = _make_engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE files DROP COLUMN image_width"))
        conn.execute(text("ALTER TABLE files DROP COLUMN image_height"))
    return engine


class TestImageDimensionsMigration:
    def test_fresh_db_has_both_columns(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)

        cols = _columns(engine, "files")
        assert "image_width" in cols
        assert "image_height" in cols

    def test_migration_adds_columns_to_legacy_db(self, tmp_path):
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        cols = _columns(engine, "files")
        assert "image_width" not in cols
        assert "image_height" not in cols

        _migrate(engine)

        cols = _columns(engine, "files")
        assert "image_width" in cols
        assert "image_height" in cols

    def test_migration_is_idempotent(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)
        _migrate(engine)  # second run must be a no-op, not an error.

        assert "image_width" in _columns(engine, "files")

    def test_existing_rows_land_null(self, tmp_path):
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO files "
                "(id, filename, title, description, drive, folder_path, "
                " file_path, file_size, file_type, mime_type, trust_tier, "
                " is_favorite, created_at, updated_at) "
                "VALUES ('aaaaaaaaaaaa', 'a.jpg', 'a', '', 'd', '', 'a.jpg', "
                "1, 'image', 'image/jpeg', 'verified', 0, "
                "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
            ))

        _migrate(engine)

        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT image_width, image_height FROM files "
                "WHERE id = 'aaaaaaaaaaaa'"
            )).one()
        assert row[0] is None
        assert row[1] is None
