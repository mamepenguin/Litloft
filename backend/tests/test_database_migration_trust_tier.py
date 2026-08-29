"""Tests for the ``trust_tier`` / ``trust_reviewed_at`` column migration.

Spec: docs/superpowers/specs/2026-08-29-web-clip-promotion.md §3, §8.

The migration in ``app/database.py:_migrate`` must:

1. Add both columns to ``files`` when absent.
2. Be idempotent.
3. Land every pre-existing row at ``verified`` with a NULL
   ``trust_reviewed_at`` — that pair is what marks a bulk-migrated row as
   distinct from one a human approved, so a "review the migrated ones"
   filter stays possible later.
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


def _make_legacy_db(tmp_path: Path):
    """A ``files`` table as it stood before the trust-tier columns."""
    from app.database import Base

    engine = _make_engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE files"))
        conn.execute(text(LEGACY_FILES_DDL))
    return engine


class TestTrustTierMigration:
    def test_fresh_db_has_both_columns(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)

        cols = _columns(engine, "files")
        assert "trust_tier" in cols
        assert "trust_reviewed_at" in cols

    def test_migration_adds_columns_to_legacy_db(self, tmp_path):
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        cols = _columns(engine, "files")
        assert "trust_tier" not in cols
        assert "trust_reviewed_at" not in cols

        _migrate(engine)

        cols = _columns(engine, "files")
        assert "trust_tier" in cols
        assert "trust_reviewed_at" in cols

    def test_migration_is_idempotent(self, tmp_path):
        from app.database import Base, _migrate

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)
        _migrate(engine)  # second run must be a no-op, not an error.

        assert "trust_tier" in _columns(engine, "files")

    def test_existing_rows_migrate_to_verified_and_unreviewed(self, tmp_path):
        """The backlog keeps grounding Ask, but stays identifiable."""
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO files "
                "(id, filename, title, drive, folder_path, file_path, "
                " file_size) "
                "VALUES ('aaaaaaaaaaaa', 'a.md', 'a', 'd', '', 'a.md', 1)"
            ))

        _migrate(engine)

        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT trust_tier, trust_reviewed_at FROM files "
                "WHERE id = 'aaaaaaaaaaaa'"
            )).one()
        assert row[0] == "verified"
        assert row[1] is None

    def test_new_rows_default_to_verified(self, tmp_path):
        """Scanner-discovered files must not need special handling."""
        from app.database import Base, _migrate
        from app.models import File
        from sqlalchemy.orm import Session

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)

        with Session(engine) as session:
            session.add(File(
                id="bbbbbbbbbbbb", filename="b.mp4", title="b", drive="d",
                file_path="b.mp4", file_size=1, file_type="video",
                mime_type="video/mp4",
            ))
            session.commit()
            row = session.get(File, "bbbbbbbbbbbb")
            assert row.trust_tier == "verified"
            assert row.trust_reviewed_at is None


    def test_upgraded_db_gets_the_trust_tier_index(self, tmp_path):
        """``create_all`` does not index an already-existing table.

        Without an explicit CREATE INDEX an upgraded install full-scans
        ``files`` on every trust-filtered query while a fresh install does
        not.
        """
        from app.database import _migrate

        engine = _make_legacy_db(tmp_path)
        _migrate(engine)

        with engine.connect() as conn:
            names = {
                r[0] for r in conn.execute(text(
                    "SELECT name FROM sqlite_master WHERE type = 'index'"
                )).all()
            }
        assert "idx_files_trust_tier" in names


class TestVerifiedFileFilter:
    def test_filter_matches_only_verified(self, tmp_path):
        from app.database import Base, _migrate
        from app.models import File, verified_file_filter
        from sqlalchemy.orm import Session

        engine = _make_engine(tmp_path)
        Base.metadata.create_all(bind=engine)
        _migrate(engine)

        with Session(engine) as session:
            session.add(File(
                id="cccccccccccc", filename="c.md", title="c", drive="d",
                file_path="c.md", file_size=1, trust_tier="verified",
            ))
            session.add(File(
                id="dddddddddddd", filename="d.md", title="d", drive="d",
                file_path="d.md", file_size=1, trust_tier="unverified",
            ))
            session.commit()

            ids = {
                f.id for f in
                session.query(File).filter(verified_file_filter()).all()
            }
        assert ids == {"cccccccccccc"}
