"""Tests for the ``md_aliases`` column migration."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.usefixtures("private_data_dir")


def _make_engine(tmp_path: Path):
    db_path = tmp_path / "migration.db"
    return create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns(table)}


class TestMdAliasesMigration:
    def test_fresh_db_has_md_aliases_column(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)
        assert "md_aliases" in _columns(engine, "files")

    def test_migration_adds_column_to_legacy_db(self, tmp_path):
        # Simulate a database where the column is absent.
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)

        # Drop the column to simulate the legacy state.  SQLite < 3.35
        # does not support DROP COLUMN, so the easiest path is to
        # rebuild the table without it.
        with engine.begin() as conn:
            # Build a minimal subset matching the legacy shape.
            conn.execute(text("ALTER TABLE files RENAME TO files_legacy"))
            conn.execute(text(
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
                "updated_at DATETIME,"
                "deleted_at DATETIME,"
                "missing_since DATETIME,"
                "file_hash VARCHAR(64),"
                "md_id VARCHAR(32)"
                ")"
            ))
            conn.execute(text("DROP TABLE files_legacy"))

        assert "md_aliases" not in _columns(engine, "files")

        _migrate(engine)
        assert "md_aliases" in _columns(engine, "files")

    def test_migration_is_idempotent(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)
        _migrate(engine)  # second run must be a no-op, not an error.
        assert "md_aliases" in _columns(engine, "files")

    def test_md_id_and_md_aliases_coexist(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)
        cols = _columns(engine, "files")
        assert "md_id" in cols
        assert "md_aliases" in cols
