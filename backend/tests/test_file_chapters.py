from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.config as config
from app.database import Base, _migrate
from app.models import File


def _enable_foreign_keys(engine) -> None:
    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


@pytest.fixture()
def session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'chapters.db'}",
        connect_args={"check_same_thread": False},
    )
    _enable_foreign_keys(engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def _make_file(db) -> File:
    file = File(
        filename="chapters.mkv",
        title="chapters.mkv",
        drive="test-drive",
        folder_path="",
        file_path="chapters.mkv",
        file_size=10,
        file_type="video",
        mime_type="video/x-matroska",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _chapter(
    title: str,
    *,
    start_time: float = 0,
    end_time: float | None = 10,
    ordering: int = 0,
) -> dict[str, object]:
    return {
        "start_time": start_time,
        "end_time": end_time,
        "title": title,
        "ordering": ordering,
    }


def _rows(db, file_id: str):
    from app.models import FileChapter

    return list(
        db.scalars(
            select(FileChapter)
            .where(FileChapter.file_id == file_id)
            .order_by(FileChapter.id)
        )
    )


class TestReplaceChapters:
    def test_non_empty_input_replaces_the_whole_set(self, session):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [_chapter("Old A"), _chapter("Old B", ordering=1)],
            "extracted",
        )
        session.commit()

        replace_chapters(
            session,
            file.id,
            [_chapter("New", start_time=5, end_time=None, ordering=7)],
            "extracted",
        )
        session.commit()

        rows = _rows(session, file.id)
        assert [(row.title, row.ordering) for row in rows] == [("New", 7)]

    @pytest.mark.parametrize("chapters", [None, []])
    def test_empty_input_writes_nothing_and_deletes_nothing(self, session, chapters):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [_chapter("Keep me")],
            "extracted",
        )
        session.commit()

        replace_chapters(session, file.id, chapters, "extracted")
        session.commit()

        rows = _rows(session, file.id)
        assert [(row.title, row.source) for row in rows] == [
            ("Keep me", "extracted")
        ]

    def test_extracted_input_never_overwrites_curated_set(self, session):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [_chapter("Approved")],
            "curated",
        )
        session.commit()

        replace_chapters(
            session,
            file.id,
            [_chapter("Re-probed")],
            "extracted",
        )
        session.commit()

        rows = _rows(session, file.id)
        assert [(row.title, row.source) for row in rows] == [
            ("Approved", "curated")
        ]

    def test_curated_input_may_replace_extracted_set(self, session):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [_chapter("Extracted")],
            "extracted",
        )
        session.commit()

        replace_chapters(
            session,
            file.id,
            [_chapter("Approved")],
            "curated",
        )
        session.commit()

        rows = _rows(session, file.id)
        assert [(row.title, row.source) for row in rows] == [
            ("Approved", "curated")
        ]

    def test_ordering_values_are_preserved_as_given(self, session):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [
                _chapter("First input", start_time=30, ordering=20),
                _chapter("Second input", start_time=0, ordering=10),
            ],
            "extracted",
        )
        session.commit()

        rows = _rows(session, file.id)
        assert [(row.title, row.ordering) for row in rows] == [
            ("First input", 20),
            ("Second input", 10),
        ]

    def test_failed_insert_can_roll_back_without_losing_existing_set(self, session):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [_chapter("Existing")],
            "extracted",
        )
        session.commit()

        replace_chapters(
            session,
            file.id,
            [_chapter(None)],  # type: ignore[arg-type]
            "extracted",
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        assert [row.title for row in _rows(session, file.id)] == ["Existing"]

    def test_malformed_input_is_rejected_before_the_existing_set_is_deleted(
        self, session
    ):
        from app.services.chapters import replace_chapters

        file = _make_file(session)
        replace_chapters(
            session,
            file.id,
            [_chapter("Existing")],
            "extracted",
        )
        session.commit()

        malformed = _chapter("Incomplete")
        del malformed["title"]
        with pytest.raises(KeyError):
            replace_chapters(
                session,
                file.id,
                [malformed],  # type: ignore[list-item]
                "extracted",
            )
        session.commit()

        assert [row.title for row in _rows(session, file.id)] == ["Existing"]


def test_file_delete_cascades_to_chapters(session):
    from app.models import FileChapter
    from app.services.chapters import replace_chapters

    file = _make_file(session)
    replace_chapters(session, file.id, [_chapter("Gone")], "extracted")
    session.commit()

    session.delete(file)
    session.commit()

    assert session.scalar(select(FileChapter).where(FileChapter.file_id == file.id)) is None


def test_chapters_probed_at_migration_is_idempotent(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'migration.db'}",
        connect_args={"check_same_thread": False},
    )
    _enable_foreign_keys(engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")

    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE files DROP COLUMN chapters_probed_at")

    assert "chapters_probed_at" not in {
        column["name"] for column in inspect(engine).get_columns("files")
    }

    _migrate(engine)
    _migrate(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("files")}
    assert "chapters_probed_at" in columns

    Session = sessionmaker(bind=engine)
    with Session() as db:
        file = _make_file(db)
        assert file.chapters_probed_at is None
        file.chapters_probed_at = datetime.now(UTC)
        db.commit()

    engine.dispose()


class TestNormaliseChapters:
    """The rules every producer shares, wherever it extracted from.

    ffprobe keeps the title under ``tags`` and yt-dlp keeps it at the top
    level, so extraction differs; what happens next must not, or the two
    producers start disagreeing about the same file.
    """

    def test_drops_entries_with_no_usable_title(self):
        from app.services.chapters import normalise_chapters

        rows = normalise_chapters(
            [
                {"start_time": "0", "end_time": "5", "title": "One"},
                {"start_time": "5", "end_time": "8", "title": "   "},
                {"start_time": "6", "end_time": "8", "title": None},
                {"start_time": "7", "end_time": "8"},
                {"start_time": "8", "end_time": None, "title": "Two"},
            ]
        )

        assert [row["title"] for row in rows] == ["One", "Two"]

    def test_ordering_is_contiguous_after_filtering(self):
        # Sorting only cares about relative values, but a caller reading
        # this as "chapter N of M" would be wrong about a set with holes.
        from app.services.chapters import normalise_chapters

        rows = normalise_chapters(
            [
                {"start_time": "0", "title": "One"},
                {"start_time": "5", "title": ""},
                {"start_time": "8", "title": "Three"},
            ]
        )

        assert [row["ordering"] for row in rows] == [0, 1]

    def test_coerces_times_and_keeps_a_missing_end(self):
        from app.services.chapters import normalise_chapters

        rows = normalise_chapters([{"start_time": "12.5", "title": " Padded "}])

        assert rows == [
            {
                "start_time": 12.5,
                "end_time": None,
                "title": "Padded",
                "ordering": 0,
            }
        ]

    def test_drops_an_entry_whose_start_will_not_coerce(self):
        # Guessing a position is worse than dropping the row.
        from app.services.chapters import normalise_chapters

        rows = normalise_chapters(
            [
                {"start_time": "not a number", "title": "Bad"},
                {"start_time": None, "title": "Also bad"},
                {"title": "No start at all"},
                {"start_time": "3", "title": "Good"},
            ]
        )

        assert [row["title"] for row in rows] == ["Good"]

    def test_an_unusable_end_does_not_cost_the_row(self):
        from app.services.chapters import normalise_chapters

        rows = normalise_chapters(
            [{"start_time": "0", "end_time": "junk", "title": "Kept"}]
        )

        assert rows == [
            {"start_time": 0.0, "end_time": None, "title": "Kept", "ordering": 0}
        ]

    def test_none_and_empty_both_yield_nothing(self):
        # A probe that said nothing and a file with no chapters are
        # different claims, but neither is a set worth writing.
        from app.services.chapters import normalise_chapters

        assert normalise_chapters(None) == []
        assert normalise_chapters([]) == []
