"""SQLAlchemy-level tests for Step A new tables.

Covers:
- `file_relations` table: UNIQUE (file_id_a, file_id_b, kind), CHECK (a != b),
  FK cascade from files on both sides.
- `file_active_summaries` table: PK=file_id (one-to-one upsert semantics),
  FK cascade from files on both `file_id` and `summary_file_id`.
- Migration / metadata idempotency (Base.metadata.create_all run twice is no-op).

These tests MUST fail on current HEAD because the models do not yet exist.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.config as config  # noqa: F401  (enforces module-reference style)
from app.database import Base
from app.models import File


def _enable_fk(engine):
    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, _connection_record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


@pytest.fixture()
def session(tmp_path):
    db_path = tmp_path / "relations.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    s = Session()
    try:
        yield s, engine
    finally:
        s.close()
        engine.dispose()


def _mk_file(db, *, filename: str, path: str, drive: str = "drv-A") -> File:
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=path,
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestMigrationIdempotent:
    def test_create_all_twice_is_noop(self, session):
        _, engine = session
        # Running create_all again must not raise and must leave tables intact.
        Base.metadata.create_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        with engine.connect() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                )
            }
        assert "file_relations" in tables
        # file_active_summaries was moved to the knowledge addon; the
        # core schema no longer creates it (spec
        # 2026-04-30-file-active-summary-to-knowledge).
        assert "file_active_summaries" not in tables


class TestFileRelationsConstraints:
    def test_insert_happy_path(self, session):
        db, _ = session
        from app.models import FileRelation

        a = _mk_file(db, filename="a.mp4", path="a.mp4")
        b = _mk_file(db, filename="b.mp4", path="b.mp4")

        rel = FileRelation(file_id_a=a.id, file_id_b=b.id, kind="related")
        db.add(rel)
        db.commit()
        db.refresh(rel)

        assert rel.id is not None
        assert rel.created_at is not None

    def test_unique_triple_rejects_duplicate(self, session):
        db, _ = session
        from app.models import FileRelation

        a = _mk_file(db, filename="a.mp4", path="a.mp4")
        b = _mk_file(db, filename="b.mp4", path="b.mp4")

        db.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind="related"))
        db.commit()

        db.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind="related"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_unique_allows_different_kind(self, session):
        db, _ = session
        from app.models import FileRelation

        a = _mk_file(db, filename="a.mp4", path="a.mp4")
        b = _mk_file(db, filename="b.mp4", path="b.mp4")

        db.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind="related"))
        db.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind="derived_from"))
        db.commit()

        from sqlalchemy import select

        rows = db.execute(select(FileRelation)).scalars().all()
        assert len(rows) == 2

    def test_check_rejects_self_relation(self, session):
        db, _ = session
        from app.models import FileRelation

        a = _mk_file(db, filename="a.mp4", path="a.mp4")

        db.add(FileRelation(file_id_a=a.id, file_id_b=a.id, kind="related"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_fk_cascade_from_file_id_a(self, session):
        db, _ = session
        from app.models import FileRelation

        a = _mk_file(db, filename="a.mp4", path="a.mp4")
        b = _mk_file(db, filename="b.mp4", path="b.mp4")
        rel = FileRelation(file_id_a=a.id, file_id_b=b.id, kind="related")
        db.add(rel)
        db.commit()
        rel_id = rel.id

        db.delete(a)
        db.commit()

        assert (
            db.query(FileRelation).filter(FileRelation.id == rel_id).first() is None
        )

    def test_fk_cascade_from_file_id_b(self, session):
        db, _ = session
        from app.models import FileRelation

        a = _mk_file(db, filename="a.mp4", path="a.mp4")
        b = _mk_file(db, filename="b.mp4", path="b.mp4")
        rel = FileRelation(file_id_a=a.id, file_id_b=b.id, kind="related")
        db.add(rel)
        db.commit()
        rel_id = rel.id

        db.delete(b)
        db.commit()

        assert (
            db.query(FileRelation).filter(FileRelation.id == rel_id).first() is None
        )


# FileActiveSummary tests removed: spec
# 2026-04-30-file-active-summary-to-knowledge moved the table to the
# knowledge addon. See addons/knowledge/tests/test_active_summary.py.
