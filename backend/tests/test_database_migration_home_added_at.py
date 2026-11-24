"""SPEC-CORE-100 I9: `home_added_at` is added to `smart_folders`,
`pinned_folders` and `collections` as a nullable column, and nothing else
about the existing rows changes."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.usefixtures("private_data_dir")

TABLES = ("smart_folders", "pinned_folders", "collections")


def _engine(tmp_path: Path):
    return create_engine(
        f"sqlite:///{tmp_path / 'migration.db'}",
        connect_args={"check_same_thread": False},
    )


def _columns(engine, table: str) -> dict[str, dict]:
    return {c["name"]: c for c in inspect(engine).get_columns(table)}


def _db_without_the_column(tmp_path: Path):
    """The schema as an older build left it: every table, but no `home_added_at`."""
    from app.database import Base

    engine = _engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in TABLES:
            if "home_added_at" in _columns(engine, table):
                conn.execute(text(f"ALTER TABLE {table} DROP COLUMN home_added_at"))
    for table in TABLES:
        assert "home_added_at" not in _columns(engine, table)
    return engine


def _seed(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO smart_folders (id, drive, viewer_id, name, query, file_type,"
            " sort_by, sort_order, created_at, updated_at) VALUES"
            " ('sfaaaaaaaaaa', 'd', NULL, 'Lectures', 'lecture', 'video', 'created_at',"
            "  'desc', '2026-01-01 00:00:00.000000', '2026-02-02 00:00:00.000000'),"
            " ('sfbbbbbbbbbb', 'e', 'abcdabcdabcdabcd', 'Other', 'x', NULL, NULL, NULL,"
            "  '2026-01-03 00:00:00.000000', NULL)"
        ))
        conn.execute(text(
            "INSERT INTO pinned_folders (drive, path, created_at) VALUES"
            " ('d', 'Projects/Alpha', '2026-01-04 00:00:00.000000'),"
            " ('e', '旅行', '2026-01-05 00:00:00.000000')"
        ))
        conn.execute(text(
            "INSERT INTO collections (id, drive, name, description, created_at, updated_at) VALUES"
            " ('colaaaaaaaaa', 'd', 'Papers', 'desc', '2026-01-06 00:00:00.000000',"
            "  '2026-01-07 00:00:00.000000'),"
            " ('colbbbbbbbbb', 'e', 'Songs', NULL, '2026-01-08 00:00:00.000000',"
            "  '2026-01-09 00:00:00.000000')"
        ))


def _rows(engine, table: str) -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {table} ORDER BY rowid"))
        return [dict(r._mapping) for r in result]


class TestHomeAddedAtMigration:
    def test_spec_core_100_i9_adds_a_nullable_column_to_each_table(self, tmp_path):
        from app.database import _migrate

        engine = _db_without_the_column(tmp_path)
        _migrate(engine)

        for table in TABLES:
            cols = _columns(engine, table)
            assert "home_added_at" in cols, table
            assert cols["home_added_at"]["nullable"] is True, table

    def test_spec_core_100_i9_existing_rows_keep_every_value_and_start_off_home(self, tmp_path):
        from app.database import _migrate

        engine = _db_without_the_column(tmp_path)
        _seed(engine)
        before = {t: _rows(engine, t) for t in TABLES}
        columns_before = {t: set(_columns(engine, t)) for t in TABLES}

        _migrate(engine)

        for table in TABLES:
            assert set(_columns(engine, table)) == columns_before[table] | {"home_added_at"}, table
            after = _rows(engine, table)
            assert [{k: v for k, v in r.items() if k != "home_added_at"} for r in after] == before[table], table
            assert [r["home_added_at"] for r in after] == [None] * len(before[table]), table

    def test_spec_core_100_i9_fresh_database_has_the_column(self, tmp_path):
        from app.database import Base, _migrate

        engine = _engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)

        for table in TABLES:
            assert "home_added_at" in _columns(engine, table), table

    def test_spec_core_100_i9_is_idempotent(self, tmp_path):
        from app.database import _migrate

        engine = _db_without_the_column(tmp_path)
        _seed(engine)
        _migrate(engine)
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE collections SET home_added_at = '2026-03-01 00:00:00.000000'"
                " WHERE id = 'colaaaaaaaaa'"
            ))
        first = {t: _rows(engine, t) for t in TABLES}

        _migrate(engine)

        assert {t: _rows(engine, t) for t in TABLES} == first
