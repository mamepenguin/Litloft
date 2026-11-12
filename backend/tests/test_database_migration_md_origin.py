"""SPEC-CORE-091 I18, I31: `_migrate` adds `files.md_origin` and its index."""
from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.usefixtures("private_data_dir")


def _make_engine(tmp_path: Path):
    return create_engine(
        f"sqlite:///{tmp_path / 'migration.db'}",
        connect_args={"check_same_thread": False},
    )


def _legacy_db_with_a_row(tmp_path: Path):
    """Today's schema with `md_origin` and anything indexing it taken out."""
    from app.database import Base

    engine = _make_engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for idx in inspect(conn).get_indexes("files"):
            if "md_origin" in idx["column_names"]:
                conn.execute(text(f'DROP INDEX "{idx["name"]}"'))
        if "md_origin" in {c["name"] for c in inspect(conn).get_columns("files")}:
            conn.execute(text("ALTER TABLE files DROP COLUMN md_origin"))
        conn.execute(text(
            "INSERT INTO files (id, filename, title, description, drive, folder_path, file_path, "
            "file_size, file_type, mime_type, created_at, updated_at) VALUES "
            "('aaaaaaaaaaaa', 'clip.md', 'clip', '', 'd', '', 'clip.md', 1, 'document', "
            "'text/markdown', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
        ))
    return engine


def _origin_indexes(engine) -> list[list[str]]:
    return [
        idx["column_names"]
        for idx in inspect(engine).get_indexes("files")
        if "md_origin" in idx["column_names"]
    ]


def _schema(engine) -> list[tuple]:
    with engine.connect() as conn:
        return sorted(
            tuple(r) for r in conn.execute(text("SELECT type, name, sql FROM sqlite_master")).all()
        )


def test_spec_core_091_an_existing_database_gains_a_nullable_md_origin_with_every_row_null(tmp_path):
    from app.database import _migrate

    engine = _legacy_db_with_a_row(tmp_path)

    _migrate(engine)

    column = {c["name"]: c for c in inspect(engine).get_columns("files")}.get("md_origin")
    assert column is not None
    assert column["nullable"] is True
    assert "32" in str(column["type"])
    with engine.connect() as conn:
        assert conn.execute(text("SELECT md_origin FROM files")).scalars().all() == [None]


def test_spec_core_091_an_existing_database_gains_the_drive_md_origin_index(tmp_path):
    from app.database import _migrate

    engine = _legacy_db_with_a_row(tmp_path)

    _migrate(engine)

    assert _origin_indexes(engine) == [["drive", "md_origin"]]


def test_spec_core_091_a_second_startup_changes_nothing(tmp_path):
    from app.database import _migrate

    engine = _legacy_db_with_a_row(tmp_path)
    _migrate(engine)
    with engine.begin() as conn:
        conn.execute(text("UPDATE files SET md_origin = 'zz-origin'"))
    first = _schema(engine)

    _migrate(engine)

    assert _schema(engine) == first
    assert _origin_indexes(engine) == [["drive", "md_origin"]]
    with engine.connect() as conn:
        assert conn.execute(text("SELECT md_origin FROM files")).scalars().all() == ["zz-origin"]
